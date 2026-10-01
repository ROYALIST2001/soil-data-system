"""
Controller layer: the front door for /predict.

It receives the request and sends the reply.
It does NO thinking. That is the service's job.
"""

from fastapi import APIRouter, HTTPException

from app.schema.predict import PredictRequest, PredictResponse
from app.service import predict as predict_service
from app.service.predict import PredictionError
from app.repository.model_loader import store

router = APIRouter()


@router.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest):
    """Take a soil reading, return how much N, P and K the crop needs."""

    # The model is still loading, or failed to load.
    # 503 means "Service Unavailable - try again shortly".
    if not store.ready:
        raise HTTPException(
            status_code=503,
            detail="The model is not loaded yet. Please try again."
        )

    try:
        return predict_service.predict(request)

    except PredictionError as e:
        # The CALLER sent something we cannot use, like an unknown crop.
        # 400 Bad Request. We send the real message so they can fix it.
        raise HTTPException(status_code=400, detail=str(e))

    except Exception:
        # Something else broke. Do NOT leak the internal message,
        # because it can reveal how the service is built.
        raise HTTPException(
            status_code=500,
            detail="Prediction failed."
        )


@router.get("/model-info")
def model_info():
    """
    Show which model is loaded and how accurate it is.

    Useful for checking the service, and for your project report.
    """
    if not store.ready:
        raise HTTPException(status_code=503, detail="The model is not loaded.")

    return {
        "winner": store.winner,
        "n_features": len(store.feature_columns),
        "feature_columns": store.feature_columns,
        "metrics": store.metadata.get(store.winner, {}),
    }
