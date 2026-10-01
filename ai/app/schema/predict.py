from pydantic import BaseModel, Field


# ---------- WHAT THE GO API SENDS US ----------
class PredictRequest(BaseModel):
    """One soil reading, ready for prediction."""

    soil_n: float = Field(..., ge=0, description="Nitrogen in soil, mg/kg")
    soil_p: float = Field(..., ge=0, description="Phosphorus in soil, mg/kg")
    soil_k: float = Field(..., ge=0, description="Potassium in soil, mg/kg")
    soil_ph: float = Field(..., ge=0, le=14, description="Soil pH")

    crop: str = Field(..., description="Crop key, lowercase. Example: rice")
    stage: str = Field(..., description="Growth stage, lowercase")
    zone: str = Field(..., description="wet, dry, or intermediate")

    target_yield: float = Field(..., gt=0, description="Tonnes per hectare")


# ---------- WHAT WE SEND BACK ----------
class PredictResponse(BaseModel):
    """How much N, P and K the crop still needs, in kg per hectare."""

    need_n: float = Field(..., description="Nitrogen needed, kg/ha")
    need_p: float = Field(..., description="Phosphorus needed, kg/ha")
    need_k: float = Field(..., description="Potassium needed, kg/ha")

    # NOTE: NOT named "model_used".
    # Pydantic reserves names starting with "model_", and using
    # one causes a warning. So we call it "predictor" instead.
    predictor: str = Field(..., description="Which model made this prediction")
