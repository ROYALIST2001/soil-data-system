from pydantic import BaseModel

# This class describes the shape of the /health answer.
# BaseModel makes it a checked shape.
class HealthResponse(BaseModel):
    status: str   # text. Example: "ok"
    service: str  # text. Example: "ai"
