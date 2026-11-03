"""Page-cited Pinecone retrieval and cached PDF ingestion. Run with --build to sync."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import unicodedata

import numpy as np
from pandukabhaya import Converter
from pypdf import PdfReader
from app.client import research_client
from app.client.pinecone_store import PineconeStore, VectorStoreError
from app.service.crop_terms import crops_in

BOOKS_DIR = Path(os.getenv("BOOKS_DIR", str(Path(__file__).resolve().parents[2] / "books")))
INDEX_DIR = Path(os.getenv("RAG_INDEX_DIR", str(Path(__file__).resolve().parents[2] / "data")))
FORMAT_VERSION = 3


def normalize(text):
    text = unicodedata.normalize("NFC", text).replace("\x00", "")
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def extract_pages(path):
    converter = Converter("fm_abhaya")
    reader = PdfReader(path)
    for number, page in enumerate(reader.pages, 1):
        parts, legacy = [], False

        def visit(text, cm, tm, font, size):
            nonlocal legacy
            name = str((font or {}).get("/BaseFont", "")).split("+")[-1]
            if name.upper().startswith("FM"):
                legacy = True
                text = converter.convert(text)
            parts.append(text)

        page.extract_text(visitor_text=visit)
        plain = "".join(parts)
        text = plain if legacy else page.extract_text(extraction_mode="layout", layout_mode_strip_rotated=False)
        # Landscape tables must not disappear because the layout extractor
        # drops rotated text. Fall back to the complete reading-order text.
        if not legacy and len(re.sub(r"\s", "", text or "")) < len(re.sub(r"\s", "", plain)):
            text = plain
        yield number, normalize(text or ""), legacy


def chunk_page(text, size=1800, overlap=220):
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            split = text.rfind("\n", start + size // 2, end)
            if split > start:
                end = split
        yield text[start:end]
        if end == len(text):
            break
        start = max(start + 1, end - overlap)


class BookIndex:
    def __init__(self, books_dir=BOOKS_DIR, index_dir=INDEX_DIR, store=None):
        self.books_dir, self.index_dir = Path(books_dir), Path(index_dir)
        self.store = store if store is not None else PineconeStore()
        self.chunks, self.documents, self.chunk_count = [], [], 0
        self.ready, self.building, self.error = False, False, None
        self.embedded_chunks = 0
        self.lock = threading.Lock()

    def fingerprint(self):
        digest = hashlib.sha256(f"{FORMAT_VERSION}:{research_client.EMBEDDING_MODEL}".encode())
        for path in sorted(self.books_dir.glob("*.pdf")):
            digest.update(path.name.encode())
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
        return digest.hexdigest()

    def ensure(self):
        with self.lock:
            self.building = True
            self.ready, self.error = False, None
            try:
                # Fail before paying for embeddings when Pinecone is unconfigured.
                self.store.connect()
                has_books = any(self.books_dir.glob("*.pdf"))
                fingerprint = self.fingerprint() if has_books else None
                remote = self.store.load(fingerprint)
                if remote:
                    self.documents, self.chunk_count = remote["documents"], remote["chunks"]
                    self.embedded_chunks, self.ready = self.chunk_count, True
                    return
                if not has_books:
                    raise VectorStoreError("No Pinecone book collection is ready. Add PDFs to ai/books and run the book indexer once.")
                self.index_dir.mkdir(parents=True, exist_ok=True)
                target = self.index_dir / (fingerprint + ".npz")
                if target.exists():
                    with np.load(target, allow_pickle=False) as data:
                        metadata = json.loads(str(data["metadata"]))
                        vectors = data["vectors"]
                    self.chunks, self.documents = metadata["chunks"], metadata["documents"]
                else:
                    chunks, documents = [], []
                    for path in sorted(self.books_dir.glob("*.pdf")):
                        section_crops, section_start = [], 0
                        report = {"title": path.name, "pages": 0, "readable_pages": 0, "legacy_pages": 0, "skipped_pages": []}
                        for page, text, legacy in extract_pages(path):
                            report["pages"] += 1
                            if len(text) < 40:
                                report["skipped_pages"].append(page)
                                continue
                            report["readable_pages"] += 1
                            report["legacy_pages"] += int(legacy)
                            if re.search(r"\bFamily\s*[-–]", text[:600], re.IGNORECASE):
                                section_crops = sorted(crops_in(text[:140])) or ["other"]
                                section_start = page
                            elif page - section_start > 10:
                                section_crops = []
                            for chunk in chunk_page(text):
                                chunks.append({"title": path.name, "page": page, "text": chunk, "section_crops": section_crops})
                        documents.append(report)
                    if not chunks:
                        raise ValueError("No readable PDFs found. Scanned books need OCR before indexing.")
                    self.documents, self.chunks = documents, chunks
                    batch_dir = self.index_dir / "embedding_batches"
                    batch_dir.mkdir(exist_ok=True)
                    vectors = []
                    for offset in range(0, len(chunks), 12):
                        texts = [item["text"] for item in chunks[offset:offset + 12]]
                        key = hashlib.sha256((research_client.EMBEDDING_MODEL + json.dumps(texts)).encode()).hexdigest()
                        cache = batch_dir / (key + ".npz")
                        if cache.exists():
                            with np.load(cache, allow_pickle=False) as data:
                                batch_vectors = data["vectors"]
                        else:
                            batch_vectors = np.asarray(research_client.embed(texts), dtype=np.float32)
                            temporary_batch = cache.with_suffix(".tmp.npz")
                            np.savez_compressed(temporary_batch, vectors=batch_vectors)
                            temporary_batch.replace(cache)
                        vectors.extend(batch_vectors)
                        self.embedded_chunks = len(vectors)
                    vectors = np.asarray(vectors, dtype=np.float32)
                    vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
                    metadata = {"chunks": chunks, "documents": documents}
                    temporary = target.with_suffix(".tmp.npz")
                    np.savez_compressed(temporary, vectors=vectors, metadata=json.dumps(metadata, ensure_ascii=False))
                    temporary.replace(target)
                    self.chunks, self.documents = chunks, documents
                if vectors.shape != (len(self.chunks), self.store.dimension) or not np.isfinite(vectors).all():
                    raise VectorStoreError("Cached embeddings do not match PINECONE_DIMENSION or contain invalid values. Check the embedding model and ingestion cache.")
                self.store.upload(self.chunks, vectors, self.documents, fingerprint)
                self.chunk_count = self.embedded_chunks = len(self.chunks)
                self.ready = True
            except Exception as exc:
                self.ready = False
                # Exception messages from our provider adapter are already redacted.
                self.error = str(exc) if isinstance(exc, (ValueError, research_client.LLMError)) else "Book indexing failed. Check readable PDF files and index storage."
            finally:
                self.building = False

    def search(self, query, limit=8):
        if not self.ready:
            raise VectorStoreError(self.error or "Pinecone book collection is not ready. Check /agent/status.")
        vector = research_client.embed([query])[0]
        requested_crops = crops_in(query)
        candidates = self.store.search(vector, requested_crops, min(80, max(limit * 6, 24)))
        # Pinecone performs vector similarity and crop filtering. Apply a small
        # keyword/crop boost only to its returned candidates, preserving Sinhala
        # crop disambiguation without loading or scanning local vectors.
        terms = {term for term in re.findall(r"[\w\u0d80-\u0dff]+", normalize(query).casefold()) if len(term) > 2}
        ranked = []
        for item in candidates:
            score = float(item.get("score", 0))
            section = set(item.get("section_crops", []))
            if score < 0.15 or (requested_crops and section and not requested_crops.intersection(section)):
                continue
            if not item.get("title") or not item.get("page") or not item.get("text"):
                continue
            lexical = sum(term in item["text"].casefold() for term in terms) / max(1, len(terms))
            boost = 0.25 if requested_crops.intersection(section) else 0
            ranked.append((score + 0.15 * lexical + boost, item))
        selected, pages = [], set()
        for _, item in sorted(ranked, key=lambda row: row[0], reverse=True):
            key = (item["title"], item["page"])
            if key in pages:
                continue
            pages.add(key)
            selected.append({"title": item["title"], "page": int(item["page"]),
                             "text": item.get("page_text") or item["text"], "score": round(item["score"], 4)})
            if len(selected) == limit:
                break
        return selected

    def status(self):
        return {"provider": "pinecone", "configured": self.store.configured,
                "index": self.store.index_name, "namespace": self.store.namespace,
                "ready": self.ready, "building": self.building, "chunks": self.chunk_count,
                "embedded_chunks": self.embedded_chunks, "documents": self.documents, "error": self.error}


book_index = BookIndex()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true", required=True)
    parser.parse_args()
    book_index.ensure()
    print(json.dumps(book_index.status(), ensure_ascii=False))
    raise SystemExit(0 if book_index.ready else 1)
