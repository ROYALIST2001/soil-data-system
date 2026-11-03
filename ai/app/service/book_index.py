"""Local, page-cited multilingual vector retrieval. Run with --build to index PDFs."""
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
    def __init__(self, books_dir=BOOKS_DIR, index_dir=INDEX_DIR):
        self.books_dir, self.index_dir = Path(books_dir), Path(index_dir)
        self.chunks, self.vectors, self.documents = [], None, []
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
            try:
                self.index_dir.mkdir(parents=True, exist_ok=True)
                target = self.index_dir / (self.fingerprint() + ".npz")
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
                self.vectors, self.ready, self.error = vectors, True, None
                self.embedded_chunks = len(self.chunks)
            except Exception as exc:
                self.ready = False
                # Exception messages from our provider adapter are already redacted.
                self.error = str(exc) if isinstance(exc, (ValueError, research_client.LLMError)) else "Book indexing failed. Check readable PDF files and index storage."
            finally:
                self.building = False

    def search(self, query, limit=8):
        if not self.ready or self.vectors is None:
            return []
        vector = np.asarray(research_client.embed([query])[0], dtype=np.float32)
        vector /= max(float(np.linalg.norm(vector)), 1e-12)
        scores = self.vectors @ vector
        # Exact crop terms complement cross-language vectors. This prevents
        # a semantically similar page about a different crop outranking it.
        terms = {term for term in re.findall(r"[\w\u0d80-\u0dff]+", normalize(query).casefold()) if len(term) > 2}
        lowered = [item["text"].casefold() for item in self.chunks]
        lexical = np.zeros(len(self.chunks), dtype=np.float32)
        for term in terms:
            matches = np.asarray([term in text for text in lowered], dtype=np.float32)
            if matches.sum():
                lexical += matches * np.log1p(len(self.chunks) / matches.sum())
        if lexical.max() > 0:
            lexical /= lexical.max()
        ranked = scores + 0.15 * lexical
        requested_crops = crops_in(query)
        for index, item in enumerate(self.chunks):
            section = set(item.get("section_crops", []))
            if requested_crops and section:
                if not requested_crops.intersection(section):
                    ranked[index] = -np.inf
                else:
                    ranked[index] += 0.25
        selected, pages = [], set()
        for index in np.argsort(ranked)[::-1]:
            if not np.isfinite(ranked[index]):
                continue
            item = self.chunks[int(index)]
            key = (item["title"], item["page"])
            if key in pages or float(scores[index]) < 0.15:
                continue
            pages.add(key)
            # Return the complete page so headings and table units survive
            # retrieval even when the match is in a later overlapping chunk.
            page_text = "\n".join(chunk["text"] for chunk in self.chunks
                                  if (chunk["title"], chunk["page"]) == key)
            selected.append({**item, "text": page_text[:12000], "score": round(float(scores[index]), 4)})
            if len(selected) == limit:
                break
        return selected

    def status(self):
        return {"ready": self.ready, "building": self.building, "chunks": len(self.chunks),
                "embedded_chunks": self.embedded_chunks, "documents": self.documents, "error": self.error}


book_index = BookIndex()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true", required=True)
    parser.parse_args()
    book_index.ensure()
    print(json.dumps(book_index.status(), ensure_ascii=False))
    raise SystemExit(0 if book_index.ready else 1)
