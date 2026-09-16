from fastapi import APIRouter

from app.schema.health import HealthResponse
from app.service import health as health_service

# Make a small group of endpoints.
router = APIRouter()

# This decorator connects the URL /health to the function below.
# response_model tells FastAPI the shape of the reply.
@router.get("/health", response_model=HealthResponse)
def health_check():
    # Ask the service for the answer.
    # No thinking here. That is the service's job.
    return health_service.get_health()
