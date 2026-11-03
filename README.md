# Soil Data Management System

A web platform for soil-quality tracking, fertilizer recommendation,
and region-wise agricultural analysis in Sri Lanka.

## Services
- mobile — Expo / React Native farmer app
- dashboard — React officer dashboard
- api  — Go backend (receives requests, stores data)
- ai   — FastAPI service (models, clustering, chatbot)
- db   — PostgreSQL database

## Run the backend
docker compose up --build

## Run the officer dashboard
cd dashboard
npm install
npm run dev

## Run the farmer mobile app
cd mobile
npm install
npx expo start

Connect the phone and computer to the same Wi-Fi, then scan the Expo QR code.

The mobile app has five tabs: **Test** for soil readings, **Insights** for
trends, maps and regional patterns, **Advisor** for the soil chatbot,
**Lands** for registered fields and crops, and **Services** for subsidies,
disaster relief and account details. Run `npm run typecheck` from `mobile`
to check the app's TypeScript.

## Soil advisor chatbot

The advisor now follows an enforced research order: local PDF RAG, Sri Lankan
agriculture websites, other Sri Lankan `.lk` websites, then other agriculture
websites. It stops when evidence is sufficient; the existing LLM writes the final
answer. Sinhala questions receive Sinhala replies, including in an existing chat.
General questions work before a farmer has submitted a soil test. Personal field
tools still need a saved reading.

Book vectors and page text are stored in **Pinecone**. Put PDFs in `ai/books`
(see its README) for initial ingestion. The AI service embeds readable passages
and uploads them to Pinecone on startup, reusing the existing local embedding
cache when possible. Searches run against Pinecone, with crop filters and page
citations. The `rag_data` volume is an optional ingestion cache, not the vector
database. The mobile advisor displays book titles/PDF pages and clickable web
sources.

Create a project API key in the [Pinecone console](https://app.pinecone.io/) and
set `PINECONE_API_KEY` in `.env`. The service creates the default serverless
`soil-advisor-books` index on AWS `us-east-1` if it does not exist. It uses a dense
`embedding` field, 1536 dimensions and cosine similarity. Configure the index,
namespace prefix, region and dimension using the `PINECONE_*` settings in
`.env.example`. An incompatible existing index is rejected; use a new index name.
Custom embedding models must match `PINECONE_DIMENSION`.

Wait for `books.ready: true` and `books.provider: "pinecone"` at
`http://localhost:8000/agent/status`. A missing key or failed connection makes
book research unavailable; the agent continues through the existing web fallback
without silently using a local vector search. Provider errors never expose keys.
Pinecone storage and requests use your project's quota/billing.

After one successful upload, a hosted AI service (including Railway) can start
without PDFs or an ingestion cache: use the same Pinecone project, index,
namespace prefix and embedding model. It reads the published book collection and
page text directly from Pinecone. The API key stays on the server.

`LLM_MODEL` remains the final-answer model. `EMBEDDING_MODEL` defaults to
`text-embedding-3-small`; the separate `WEB_SEARCH_MODEL` defaults to `gpt-5-mini`
because domain-filtered web search requires a supporting Responses API model.
Both use `LLM_API_KEY`/`LLM_BASE_URL`. OpenAI-compatible providers that only support
chat completions cannot supply these research endpoints; failures are recorded
as unavailable, never represented as successful searches. Search and embeddings
have their own API usage charges.

Default first-tier domain: `doa.gov.lk`. The last tier uses FAO, IRRI, CIMMYT,
ICRISAT and CABI. Override `SL_AGRICULTURE_DOMAINS`/`AGRICULTURE_DOMAINS` in `.env`.
Every search tier validates returned citation hostnames. Retrieved content is
untrusted evidence; it cannot replace agent instructions. If references fail or
do not establish the answer, the agent identifies that limit and does not invent
fertilizer doses. Research has a bounded time budget; incomplete later tiers are
marked as skipped. Old statistics are labeled as historical.

Reference: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search),
[multilingual embeddings](https://developers.openai.com/api/docs/guides/embeddings).

The mobile app's **Advisor** tab calls the Go API, which runs the advisory agent
through the Python AI service. It requires a valid API key and internet access.

1. Copy `.env.example` to `.env` if you do not already have one.
2. Set `LLM_API_KEY` and `PINECONE_API_KEY` in `.env`. The example uses
   `https://api.openai.com/v1` and `gpt-4o-mini`. Keep both keys out of Git.
3. Apply the configuration and backend changes:

   ```powershell
   docker compose up -d --build api ai
   ```

   Recreate the AI service after changing `.env`; `docker compose restart`
   alone does not reload container environment variables.

4. Log into the mobile app, open **Advisor**, and try "What does soil pH mean?"
   or a Sinhala crop question. For "What fertilizer does my field need?",
   submit a soil test first or use your saved latest reading.

`http://localhost:8000/agent/status` reports whether a key is configured; it
does not check whether the provider accepts it. For failures, check
`docker compose logs --tail 50 api ai`. A `401` means the key was rejected
or expired; replace it and recreate the AI service. A `429` means you need
to check API billing or rate limits. Weather forecasts are not connected.

Run the chatbot regression tests with:

```powershell
cd api
go test ./...
cd ..
docker compose exec -T ai python -m unittest discover -s tests -v
```
