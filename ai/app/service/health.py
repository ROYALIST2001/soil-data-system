from app.schema.health import HealthResponse

# Build the health answer.
# -> HealthResponse means: this function returns a HealthResponse object.
def get_health() -> HealthResponse:
    # Make the object and give it back.
    return HealthResponse(status="ok", service="ai")
