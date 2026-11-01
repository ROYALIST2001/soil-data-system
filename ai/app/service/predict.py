"""
Service layer: turns a soil reading into a nutrient-need prediction.

This file knows NOTHING about HTTP. It only does the thinking.
That makes it easy to test without starting a server.
"""

import numpy as np

from app.repository.model_loader import store
from app.schema.predict import PredictRequest, PredictResponse


class PredictionError(Exception):
    """Raised when the input cannot be used. The caller's fault."""
    pass


def _build_feature_row(request: PredictRequest) -> np.ndarray:
    """
    Turn the request into a row of numbers, in the SAVED column order.

    In the notebook, Pandas get_dummies did this. Here we do it by hand.
    """
    columns = store.feature_columns

    # STEP 1: start with EVERY column at zero.
    row = {col: 0.0 for col in columns}

    # STEP 2: fill in the number features.
    row["soil_n"] = float(request.soil_n)
    row["soil_p"] = float(request.soil_p)
    row["soil_k"] = float(request.soil_k)
    row["soil_ph"] = float(request.soil_ph)
    row["target_yield"] = float(request.target_yield)

    # STEP 3: switch on ONE column for each word feature.
    #
    # If the word is unknown, its column does not exist.
    # We REFUSE rather than leave all columns at zero, because
    # "no crop at all" is something the model never saw.
    for field, value in [("crop", request.crop),
                         ("stage", request.stage),
                         ("zone", request.zone)]:

        column_name = f"{field}_{value}"

        if column_name not in row:
            # Collect the valid options, to give a helpful message.
            valid = sorted(
                c.split("_", 1)[1] for c in columns
                if c.startswith(f"{field}_")
            )
            raise PredictionError(
                f"Unknown {field} '{value}'. Valid options: {', '.join(valid)}"
            )

        row[column_name] = 1.0

    # STEP 4: read the values out IN THE SAVED ORDER.
    #
    # THIS IS THE MOST IMPORTANT LINE IN THE FILE.
    # A wrong order makes the model read pH where it expects
    # phosphorus, with NO error message.
    values = [row[col] for col in columns]

    # Shape (1, n_features). The 1 means "one reading".
    return np.array([values], dtype=np.float64)


def predict(request: PredictRequest) -> PredictResponse:
    """Predict how much N, P and K the crop still needs, in kg/ha."""

    if not store.ready:
        raise RuntimeError("The model is not loaded.")

    # ---------- STEP 1: build the feature row ----------
    features = _build_feature_row(request)

    # ---------- STEP 2 and 3: scale and predict ----------
    if store.winner == "neural_network":
        import torch

        # The network was TRAINED on scaled data,
        # so it must be GIVEN scaled data.
        # This is the SCALER-CONSISTENCY RULE.
        scaled = store.feature_scaler.transform(features)

        with torch.no_grad():   # no gradients needed. Faster, less memory.
            output = store.predictor(
                torch.tensor(scaled, dtype=torch.float32)
            ).numpy()

        # The output is SCALED. Turn it back into real kg/ha.
        result = store.label_scaler.inverse_transform(output)

    else:
        # The forest was trained on UNSCALED data, so feed it unscaled.
        # Trees do not care about scale: "is soil_k above 150?" gives
        # the same answer whatever the range.
        # Its output is ALREADY in kg/ha, so no inverse needed.
        result = store.predictor.predict(features)

    # ---------- STEP 4: clean up the answer ----------
    #
    # A model can predict a small negative number, like -0.4 kg.
    # You cannot apply NEGATIVE fertilizer, so we turn it into 0.
    # This matches the training data, which used max(gap, 0).
    need_n = max(float(result[0][0]), 0.0)
    need_p = max(float(result[0][1]), 0.0)
    need_k = max(float(result[0][2]), 0.0)

    return PredictResponse(
        need_n=round(need_n, 2),
        need_p=round(need_p, 2),
        need_k=round(need_k, 2),
        predictor=store.winner,
    )
