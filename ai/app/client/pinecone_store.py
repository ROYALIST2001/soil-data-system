"""Pinecone document storage for page-cited book embeddings."""
from functools import wraps
import hashlib
import json
import os
import time

from pinecone import ConflictError, DenseVectorQuery, NotFoundError, Pinecone, PineconeError
from app.client.llm_client import LLMError
from app.client.research_client import EMBEDDING_MODEL

REMOTE_FORMAT = 1
MANIFEST_ID = "collection-manifest"


class VectorStoreError(LLMError):
    pass


def provider_call(method):
    @wraps(method)
    def wrapped(*args, **kwargs):
        try:
            return method(*args, **kwargs)
        except PineconeError:
            # SDK errors can contain request headers or provider response bodies.
            raise VectorStoreError(
                "Pinecone could not complete the request. Check PINECONE_API_KEY, "
                "index permissions, project limits and network access."
            ) from None
    return wrapped


def bounded_text(text, byte_limit=24000):
    """Keep Unicode page text comfortably within Pinecone's metadata limits."""
    return text.encode("utf-8")[:byte_limit].decode("utf-8", errors="ignore")


class PineconeStore:
    def __init__(self):
        self.api_key = os.getenv("PINECONE_API_KEY", "").strip()
        self.index_name = os.getenv("PINECONE_INDEX", "soil-advisor-books").strip()
        self.namespace_prefix = os.getenv("PINECONE_NAMESPACE", "soil-books").strip()
        self.cloud = os.getenv("PINECONE_CLOUD", "aws").strip()
        self.region = os.getenv("PINECONE_REGION", "us-east-1").strip()
        try:
            self.dimension = int(os.getenv("PINECONE_DIMENSION", "1536"))
        except ValueError:
            self.dimension = 0
        self.client, self.index, self.namespace = None, None, None

    @property
    def configured(self):
        return bool(self.api_key)

    @provider_call
    def connect(self):
        if not self.configured:
            raise VectorStoreError("Set PINECONE_API_KEY in .env and recreate the AI service to enable book RAG.")
        if not self.index_name or not self.namespace_prefix or self.dimension < 1:
            raise VectorStoreError("Pinecone index, namespace and embedding dimension must be configured.")
        if self.index is not None:
            return
        self.client = Pinecone(api_key=self.api_key, timeout=10)
        try:
            description = self.client.indexes.describe(self.index_name)
        except NotFoundError:
            try:
                description = self.client.indexes.create(
                    name=self.index_name,
                    schema={"fields": {"embedding": {
                        "type": "dense_vector", "dimension": self.dimension, "metric": "cosine"}}},
                    deployment={"deployment_type": "managed", "cloud": self.cloud, "region": self.region},
                    timeout=60,
                )
            except ConflictError:
                # Another worker may have created the same index in the meantime.
                description = self.client.indexes.describe(self.index_name)
        field = description.schema.to_dict().get("fields", {}).get("embedding", {})
        if (field.get("type"), field.get("dimension"), field.get("metric")) != (
                "dense_vector", self.dimension, "cosine"):
            raise VectorStoreError(
                "Pinecone index schema does not match. Use a new PINECONE_INDEX with an "
                "embedding dense-vector field, cosine metric and PINECONE_DIMENSION dimensions."
            )
        if not description.status.ready:
            raise VectorStoreError("Pinecone index is still starting. Retry book indexing when it is ready.")
        self.index = self.client.index(host=description.host)

    def generation_namespace(self, fingerprint):
        # Isolate book/model versions; partially uploaded or removed books cannot
        # appear in searches of the active generation. Never delete user data.
        suffix = hashlib.sha256(f"{REMOTE_FORMAT}:{fingerprint}".encode()).hexdigest()[:24]
        return f"{self.namespace_prefix}-{suffix}"

    def _manifest(self, namespace):
        try:
            response = self.index.documents.fetch(namespace=namespace, ids=[MANIFEST_ID])
        except NotFoundError:
            return None
        document = response.documents.get(MANIFEST_ID)
        return document.to_dict() if document else None

    def _count(self, namespace):
        try:
            return int(self.index.describe_namespace(name=namespace).record_count)
        except NotFoundError:
            return 0

    def _validate_manifest(self, manifest):
        if (manifest.get("format") != REMOTE_FORMAT or
                manifest.get("embedding_model") != EMBEDDING_MODEL or
                manifest.get("dimension") != self.dimension):
            raise VectorStoreError("Pinecone collection uses a different embedding model or format. Re-index the local books.")
        namespace = self.generation_namespace(manifest.get("fingerprint", ""))
        if manifest.get("corpus_namespace") != namespace or int(manifest.get("chunk_count", 0)) < 1:
            raise VectorStoreError("Pinecone collection manifest is invalid. Re-index the local books.")
        return namespace

    @provider_call
    def load(self, fingerprint=None):
        namespace = self.generation_namespace(fingerprint) if fingerprint else self.namespace_prefix
        manifest = self._manifest(namespace)
        if not manifest:
            return None
        generation = self._validate_manifest(manifest)
        if fingerprint and manifest["fingerprint"] != fingerprint:
            return None
        if self._count(generation) < int(manifest["chunk_count"]) + 1:
            return None
        try:
            documents = json.loads(manifest["documents_json"])
            if not isinstance(documents, list):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise VectorStoreError("Pinecone collection metadata is invalid. Re-index the local books.") from None
        self.namespace = generation
        if fingerprint:
            # Recover publication if a previous worker stopped after completing
            # the generation but before updating the remote catalog pointer.
            published = self._manifest(self.namespace_prefix)
            if not published or published.get("fingerprint") != fingerprint:
                self.index.documents.upsert(namespace=self.namespace_prefix, documents=[manifest])
                self._wait_visible(self.namespace_prefix, 1, fingerprint)
        return {"documents": documents, "chunks": int(manifest["chunk_count"])}

    def _wait_visible(self, namespace, count, fingerprint=None):
        deadline = time.monotonic() + 30
        while True:
            if self._count(namespace) >= count:
                manifest = self._manifest(namespace) if fingerprint else None
                if not fingerprint or (manifest and manifest.get("fingerprint") == fingerprint):
                    return
            if time.monotonic() >= deadline:
                raise VectorStoreError("Pinecone is still applying the book upload. Retry indexing shortly.")
            time.sleep(1)

    @provider_call
    def upload(self, chunks, vectors, documents, fingerprint):
        if len(chunks) != len(vectors) or not chunks:
            raise VectorStoreError("Book chunks and embeddings do not match.")
        namespace = self.generation_namespace(fingerprint)
        pages = {}
        for chunk in chunks:
            key = (chunk["title"], chunk["page"])
            pages.setdefault(key, []).append(chunk["text"])
        page_texts = {key: bounded_text("\n".join(parts)) for key, parts in pages.items()}
        for offset in range(0, len(chunks), 16):
            batch = []
            for ordinal in range(offset, min(offset + 16, len(chunks))):
                chunk = chunks[ordinal]
                values = [float(value) for value in vectors[ordinal]]
                if len(values) != self.dimension:
                    raise VectorStoreError("Embedding size does not match PINECONE_DIMENSION. Check the configured embedding model.")
                record = {
                    "_id": f"chunk-{ordinal:08d}", "embedding": values,
                    "record_type": "chunk", "title": chunk["title"], "page": chunk["page"],
                    "text": chunk["text"], "page_text": page_texts[(chunk["title"], chunk["page"])],
                }
                if chunk.get("section_crops"):
                    record["section_crops"] = chunk["section_crops"]
                batch.append(record)
            response = self.index.documents.upsert(namespace=namespace, documents=batch)
            if response.upserted_count != len(batch):
                raise VectorStoreError("Pinecone did not accept every book chunk. Retry indexing.")
        self._wait_visible(namespace, len(chunks))
        manifest = {
            "_id": MANIFEST_ID, "embedding": [float(value) for value in vectors[0]],
            "record_type": "manifest", "format": REMOTE_FORMAT, "fingerprint": fingerprint,
            "embedding_model": EMBEDDING_MODEL, "dimension": self.dimension,
            "corpus_namespace": namespace, "chunk_count": len(chunks),
            "documents_json": json.dumps(documents, ensure_ascii=False),
        }
        self.index.documents.upsert(namespace=namespace, documents=[manifest])
        self._wait_visible(namespace, len(chunks) + 1, fingerprint)
        # Publish the pointer only after the entire generation is readable.
        # A hosted service without PDFs reads this catalog on startup.
        self.index.documents.upsert(namespace=self.namespace_prefix, documents=[manifest])
        self._wait_visible(self.namespace_prefix, 1, fingerprint)
        self.namespace = namespace

    @provider_call
    def search(self, vector, crops, limit):
        if not self.index or not self.namespace:
            raise VectorStoreError("Pinecone book collection is not ready. Check /agent/status.")
        if len(vector) != self.dimension:
            raise VectorStoreError("Query embedding size does not match PINECONE_DIMENSION.")
        filters = {"record_type": {"$eq": "chunk"}}
        if crops:
            filters = {"$and": [filters, {"$or": [
                {"section_crops": {"$in": sorted(crops)}},
                {"section_crops": {"$exists": False}},
            ]}]}
        response = self.index.documents.search(
            namespace=self.namespace, top_k=limit,
            score_by=[DenseVectorQuery(field="embedding", values=vector)],
            include_fields=["title", "page", "text", "page_text", "section_crops"], filter=filters,
            timeout=10,
        )
        return [{**document.to_dict(), "score": float(document.score)} for document in response.matches]
