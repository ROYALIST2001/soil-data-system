from contextlib import asynccontextmanager

from fastapi import FastAPI

# CHANGED: added cluster.
from app.controller import health, predict, cluster
from app.repository.model_loader import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code before 'yield' runs ONCE at STARTUP.
    Code after 'yield' runs ONCE at SHUTDOWN.

    We load the model here, so it is in memory before any
    request arrives. Loading per request would add 1 to 3
    seconds to EVERY prediction.
    """
    print("Loading model and scalers...")

    try:
        store.load()
        print(f"Model loaded. Winner: {store.winner}")
        print(f"Features: {len(store.feature_columns)}")

    except Exception as e:
        # Do NOT crash. If we crashed, /health would die too and you
        # would not know why. Instead: print the problem clearly,
        # keep running, and let /predict return a clear 503.
        print("=" * 60)
        print("COULD NOT LOAD THE MODEL")
        print(str(e))
        print("The service will run, but /predict will return 503.")
        print("=" * 60)

    yield   # ---- the app serves requests here ----

    print("AI service shutting down.")


app = FastAPI(title="Soil AI Service", lifespan=lifespan)

# Attach the controllers. One line per controller.
app.include_router(health.router)
app.include_router(predict.router)
app.include_router(cluster.router)
