# Local reference books

Place reference PDFs in this folder. Docker mounts it read-only at `/code/books`.
PDFs and generated vector indexes are intentionally excluded from Git and Docker
images. The current local collection contains `AgStat 2021.pdf` (English
statistics) and `technoguide-book.pdf` (Sinhala crop guidance).

The indexer detects FM-family legacy Sinhala fonts and converts those text spans
to Unicode using [Pandukabhaya](https://github.com/akuruAI/pandukabhaya) (MIT).
English spans, numerical values and PDF page numbers are retained. Truly scanned
pages need OCR; a document with no readable text cannot be indexed. Legacy font
conversion and complex table extraction should be checked against the originals,
especially before using numerical application rates.

On AI service startup, readable pages are chunked and embedded with the configured
multilingual embedding model. Indexes and completed embedding batches persist in
the `rag_data` Docker volume. File-content fingerprints and model names invalidate
the cache when books or embedding models change. Recreating the AI container after
adding/replacing PDFs rebuilds the index, reusing identical cached batches.

Check readiness at `http://localhost:8000/agent/status`. Wait for `books.ready` to
be true. A configured key is not proof of provider access. If indexing fails, the
status includes a redacted error; retry after resolving API/network issues:

```powershell
docker compose exec -T ai python -m app.service.book_index --build
docker compose restart ai
```

Book citations use one-based **PDF page numbers**, which may differ from printed
page numbers. Historical statistics are not presented as current figures.
