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

The mobile app's **Ask** tab calls the Go API, which runs the advisory agent
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

4. Log into the mobile app and submit a soil test (or use your saved latest
   reading). Open **Ask** and try "What does soil pH mean?", then
   "What fertilizer does my field need?".

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
