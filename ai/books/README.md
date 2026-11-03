# Local reference books

Place reference PDFs in this folder for initial ingestion. Docker mounts it
read-only at `/code/books`. PDFs and generated ingestion caches are intentionally
excluded from Git and Docker images. The current local collection contains `AgStat 2021.pdf` (English
statistics) and `technoguide-book.pdf` (Sinhala crop guidance).

The indexer detects FM-family legacy Sinhala fonts and converts those text spans
to Unicode using [Pandukabhaya](https://github.com/akuruAI/pandukabhaya) (MIT).
English spans, numerical values and PDF page numbers are retained. Truly scanned
pages need OCR; a document with no readable text cannot be indexed. Legacy font
conversion and complex table extraction should be checked against the originals,
especially before using numerical application rates.

On AI service startup, readable pages are chunked and embedded with the configured
multilingual embedding model, then uploaded to **Pinecone** with their book title,
PDF page, crop-section tags and page text. Set `PINECONE_API_KEY` in the root
`.env` first. The default serverless index is `soil-advisor-books`, with a named
`embedding` dense-vector field, cosine metric and 1536 dimensions. The service
creates it if missing. `PINECONE_INDEX`, `PINECONE_NAMESPACE`, `PINECONE_CLOUD`,
`PINECONE_REGION` and `PINECONE_DIMENSION` override the defaults.

Completed embedding batches and legacy `.npz` indexes remain reusable ingestion
caches in the `rag_data` Docker volume. Query-time similarity search runs in
Pinecone; it does not scan these files. File-content fingerprints, extraction
format and embedding model names identify each collection generation. Unchanged,
already-uploaded collections skip extraction, embedding and upload on restart.

A new generation becomes active only after all chunks and its manifest are
readable in Pinecone. Changed/removed books cannot leak into searches from an old
generation. Old generations are retained in separate namespaces so an interrupted
upload cannot destroy the previous collection. You can remove unused generation
namespaces in the Pinecone console after confirming no deployment uses them;
keep the configured catalog namespace (default `soil-books`) and active generation.

After initial ingestion, Railway or another hosted AI service needs only the same
Pinecone settings and embeddings API settings. When no PDFs are present, it loads
the published collection manifest and retrieves page text from Pinecone. No local
PDFs, vector files or persistent ingestion volume are required for serving queries.

Check readiness at `http://localhost:8000/agent/status`. Wait for `books.ready` to
be true; `books.provider` is `pinecone`, with the active index and namespace.
A configured key is not proof of provider access. If indexing fails, the status
includes a redacted error. After changing `.env`, recreate the service to load its
new settings, then retry if necessary:

```powershell
docker compose up -d --build ai

# Retry an interrupted upload after resolving the reported issue:
docker compose exec -T ai python -m app.service.book_index --build
docker compose restart ai
```

Book citations use one-based **PDF page numbers**, which may differ from printed
page numbers. Historical statistics are not presented as current figures.

SDK reference: [Pinecone document indexes](https://sdk.pinecone.io/python/how-to/documents/schema-and-upsert.html).
