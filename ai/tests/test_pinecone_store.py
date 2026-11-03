"""Exercise the real pinned SDK against a simulated Pinecone HTTP service."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import httpx
import numpy as np
from app.client import research_client
from app.client.pinecone_store import PineconeStore, VectorStoreError, bounded_text
from app.service.book_index import BookIndex


class PineconeHTTP:
    def __init__(self):
        self.created, self.namespaces, self.requests = False, {}, []
        self.fail_upload, self.search_error = False, False
        self.dimension = 2

    def send(self, client, request, **kwargs):
        path = request.url.path
        body = json.loads(request.content) if request.content else {}
        self.requests.append((request.method, path, body))
        status, data = 200, {}
        if path == "/indexes" and request.method == "POST":
            self.created = True
            self.dimension = body["schema"]["fields"]["embedding"]["dimension"]
        if path == "/indexes" or path.startswith("/indexes/"):
            if not self.created:
                status, data = 404, {"message": "Index does not exist"}
            else:
                data = {
                    "name": "soil-advisor-books", "host": "test.svc.pinecone.io",
                    "status": {"ready": True, "state": "Ready"},
                    "schema": {"fields": {"embedding": {"type": "dense_vector", "dimension": self.dimension, "metric": "cosine"}}},
                    "deployment": {"deployment_type": "managed", "cloud": "aws", "region": "us-east-1"},
                    "deletion_protection": "disabled",
                }
        elif path.startswith("/namespaces/"):
            parts = path.split("/")
            namespace = parts[2]
            records = self.namespaces.setdefault(namespace, {})
            if len(parts) == 3:
                data = {"name": namespace, "record_count": str(len(records))}
            elif parts[-1] == "fetch":
                data = {"namespace": namespace, "documents": {key: records[key] for key in body["ids"] if key in records}, "usage": {"read_units": 1}}
            elif parts[-1] == "upsert":
                if self.fail_upload:
                    status, data = 400, {"message": "simulated upload failure"}
                else:
                    for record in body["documents"]:
                        records[record["_id"]] = record
                    data = {"upserted_count": len(body["documents"])}
            elif parts[-1] == "search":
                if self.search_error:
                    status, data = 400, {"message": "provider details must not leak test-secret"}
                else:
                    query = body["score_by"][0]["values"]
                    matches = []
                    for record in records.values():
                        if record["record_type"] != "chunk":
                            continue
                        score = sum(a * b for a, b in zip(query, record["embedding"]))
                        fields = {name: record[name] for name in body["include_fields"] if name in record}
                        matches.append({"_id": record["_id"], "_score": score, **fields})
                    data = {"namespace": namespace, "matches": sorted(matches, key=lambda match: match["_score"], reverse=True)[:body["top_k"]], "usage": {"read_units": 1}}
            else:
                raise AssertionError(f"Unexpected document operation: {path}")
        else:
            raise AssertionError(f"Unexpected Pinecone request: {path}")
        return httpx.Response(status, json=data, request=request)


class PineconeTests(unittest.TestCase):
    def setUp(self):
        self.backend = PineconeHTTP()
        env = patch.dict(os.environ, {"PINECONE_API_KEY": "test-secret", "PINECONE_DIMENSION": "2",
                                     "PINECONE_INDEX": "soil-advisor-books", "PINECONE_NAMESPACE": "soil-books"})
        env.start()
        self.addCleanup(env.stop)
        transport = patch.object(httpx.HTTPTransport, "handle_request", autospec=True, side_effect=self.backend.send)
        transport.start()
        self.addCleanup(transport.stop)
        self.store = PineconeStore()
        self.addCleanup(self.close)
        self.chunks = [
            {"title": "guide.pdf", "page": 17, "text": "මුං වගාවට සුදුසු පස", "section_crops": ["mung"]},
            {"title": "guide.pdf", "page": 17, "text": "ජලවහනය", "section_crops": ["mung"]},
        ]
        self.vectors = np.asarray([[0.8, 0.6], [0.6, 0.8]])
        self.documents = [{"title": "guide.pdf", "pages": 20, "readable_pages": 19}]

    def close(self):
        if self.store.index:
            self.store.index.close()
        if self.store.client:
            self.store.client.close()

    def upload(self):
        self.store.connect()
        self.store.upload(self.chunks, self.vectors, self.documents, "edition-one")

    def test_real_sdk_creates_uploads_queries_and_resumes_remote_collection(self):
        self.upload()
        hits = self.store.search([1., 0.], {"mung"}, 8)
        self.assertEqual(hits[0]["page"], 17)
        self.assertIn("ජලවහනය", hits[0]["page_text"])
        searches = [body for _, path, body in self.backend.requests if path.endswith("/search")]
        self.assertEqual(searches[0]["score_by"][0]["field"], "embedding")
        self.assertEqual(searches[0]["filter"]["$and"][1]["$or"][0], {"section_crops": {"$in": ["mung"]}})
        self.assertEqual(self.store.load(), {"documents": self.documents, "chunks": 2})
        self.assertEqual(self.store.load("edition-one")["chunks"], 2)
        self.assertIsNone(self.store.load("different-edition"))
        self.assertFalse(any(method == "DELETE" for method, _, _ in self.backend.requests))

    def test_incomplete_generation_cannot_replace_published_collection(self):
        self.upload()
        original = self.store.namespace
        self.backend.fail_upload = True
        with self.assertRaises(VectorStoreError):
            self.store.upload(self.chunks, self.vectors, self.documents, "edition-two")
        self.backend.fail_upload = False
        self.assertEqual(self.store.load()["chunks"], 2)
        self.assertEqual(self.store.namespace, original)

    def test_incomplete_remote_generation_is_not_reported_ready(self):
        self.upload()
        del self.backend.namespaces[self.store.namespace]["chunk-00000000"]
        self.assertIsNone(self.store.load())

    def test_completed_generation_repairs_an_interrupted_catalog_publication(self):
        self.upload()
        self.backend.namespaces[self.store.namespace_prefix].clear()
        self.assertIsNone(self.store.load())
        self.assertEqual(self.store.load("edition-one")["chunks"], 2)
        self.assertEqual(self.store.load()["chunks"], 2)

    def test_changed_embedding_model_cannot_query_existing_collection(self):
        self.upload()
        with patch("app.client.pinecone_store.EMBEDDING_MODEL", "different-model"):
            with self.assertRaisesRegex(VectorStoreError, "different embedding model"):
                self.store.load()

    def test_mismatched_index_dimensions_are_rejected(self):
        self.backend.created, self.backend.dimension = True, 3
        with self.assertRaisesRegex(VectorStoreError, "schema does not match"):
            self.store.connect()
        self.assertIsNone(self.store.index)

    def test_provider_failure_is_redacted_and_does_not_use_local_search(self):
        self.upload()
        self.backend.search_error = True
        with self.assertRaises(VectorStoreError) as failure:
            self.store.search([1., 0.], set(), 8)
        self.assertNotIn("test-secret", str(failure.exception))
        self.assertIn("Pinecone", str(failure.exception))

    def test_missing_key_does_not_call_embeddings_or_pinecone(self):
        with patch.dict(os.environ, {"PINECONE_API_KEY": ""}), TemporaryDirectory() as folder, \
                patch.object(research_client, "embed") as embedding:
            index = BookIndex(folder, Path(folder) / "cache")
            index.ensure()
            self.assertFalse(index.ready)
            self.assertIn("PINECONE_API_KEY", index.error)
            embedding.assert_not_called()
            self.assertEqual(self.backend.requests, [])

    def test_utf8_page_limit_preserves_sinhala(self):
        text = bounded_text("මුං වගාව " * 10000)
        self.assertLessEqual(len(text.encode("utf-8")), 24000)
        self.assertTrue(text.startswith("මුං වගාව"))
        self.assertNotIn("\ufffd", text)


if __name__ == "__main__":
    unittest.main()
