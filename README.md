# Soil Data Management System

A web platform for soil-quality tracking, fertilizer recommendation,
and region-wise agricultural analysis in Sri Lanka.

## Services
- web  — React web app (user screens)
- api  — Go backend (receives requests, stores data)
- ai   — FastAPI service (models, clustering, chatbot)
- db   — PostgreSQL database

## Run the backend
docker compose up --build

## Run the web app
cd web
npm run dev