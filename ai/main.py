# Import FastAPI, the tool that builds our web service.
from fastapi import FastAPI

# Create the application.
app = FastAPI()

# This runs when someone visits GET /health.
@app.get("/health")
def health_check():
    # Return a small answer. FastAPI turns it into JSON automatically.
    return {"status": "ok", "service": "ai"}