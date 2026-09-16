from fastapi import FastAPI

from app.controller import health

# Make the application.
app = FastAPI(title="Soil AI Service")

# Attach the health controller's endpoints to the app.
# We add one line here for each new controller.
app.include_router(health.router)
