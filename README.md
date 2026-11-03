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

Put PDFs in `ai/books` (see its README). The AI service builds a multilingual
embedding index on startup and keeps it in the persistent `rag_data` volume.
Initial indexing sends extracted book passages to the configured embeddings API.
Wait for `books.ready: true` at `/agent/status` before testing book retrieval.
The mobile advisor displays book titles/PDF pages and clickable web sources.

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
2. Set `LLM_API_KEY` in `.env` to your OpenAI API key. The example uses
   `https://api.openai.com/v1` and `gpt-4o-mini`. Keep the key out of Git.
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
