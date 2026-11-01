"""
Repository layer: loads the trained model and scalers from disk.

This runs ONCE at startup. Loading per request would add
1 to 3 seconds to every single prediction.
"""

import os
import json
import joblib


# Where the artifacts live. Overridable by an environment variable.
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "artifacts")


class ModelStore:
    """Holds everything needed to make a prediction. Loaded once."""

    def __init__(self):
        self.ready = False
        self.metadata = None
        self.feature_scaler = None
        self.label_scaler = None
        self.feature_columns = None
        self.predictor = None
        self.winner = None

    def load(self):
        """Load everything from disk. Called once, at startup."""

        # ---------- 1. Read the metadata ----------
        meta_path = os.path.join(ARTIFACTS_DIR, "metadata.json")
        if not os.path.exists(meta_path):
            raise FileNotFoundError(
                f"Cannot find {meta_path}. "
                "Run the Phase 5 notebook and copy the artifacts folder."
            )

        with open(meta_path) as f:
            self.metadata = json.load(f)

        self.winner = self.metadata["winner"]

        # ---------- 2. Load the scalers ----------
        #
        # CRITICAL: these are the EXACT scalers the notebook fitted.
        # Using a new scaler would feed the model numbers in a range
        # it never learned on, giving WRONG answers with NO error.
        self.feature_scaler = joblib.load(
            os.path.join(ARTIFACTS_DIR, "feature_scaler.pkl"))
        self.label_scaler = joblib.load(
            os.path.join(ARTIFACTS_DIR, "label_scaler.pkl"))

        # ---------- 3. Load the column order ----------
        #
        # CRITICAL: the input array must be built in THIS order.
        # A different order makes the model read pH where it expects
        # phosphorus. No error, no crash, just wrong answers.
        self.feature_columns = joblib.load(
            os.path.join(ARTIFACTS_DIR, "feature_columns.pkl"))

        # ---------- 4. Load the winning model ----------
        if self.winner == "neural_network":
            self.predictor = self._load_neural_network()
        else:
            self.predictor = joblib.load(
                os.path.join(ARTIFACTS_DIR, "rf_model.pkl"))

        self.ready = True

    def _load_neural_network(self):
        """
        Rebuild the network class, then pour the saved numbers in.

        We saved the STATE_DICT, which is only weights and biases.
        So the class shape must be rebuilt first.
        """
        # Imported here, not at the top, so the service can run
        # WITHOUT PyTorch installed when the winner is the forest.
        import torch
        import torch.nn as nn

        # Read the sizes from metadata, so they can NEVER drift
        # out of sync with the notebook.
        arch = self.metadata["neural_network"]["architecture"]
        in_size, h1, h2, out_size = arch
        dropout = self.metadata["neural_network"]["dropout"]

        class FertilizerNet(nn.Module):
            """
            MUST MATCH THE NOTEBOOK EXACTLY.
            Same layers, same order, same attribute names.
            """

            def __init__(self):
                super().__init__()
                self.layer1 = nn.Linear(in_size, h1)
                self.relu1 = nn.ReLU()
                self.drop1 = nn.Dropout(dropout)

                self.layer2 = nn.Linear(h1, h2)
                self.relu2 = nn.ReLU()
                self.drop2 = nn.Dropout(dropout)

                self.output = nn.Linear(h2, out_size)

            def forward(self, x):
                x = self.drop1(self.relu1(self.layer1(x)))
                x = self.drop2(self.relu2(self.layer2(x)))
                return self.output(x)

        model = FertilizerNet()
        model.load_state_dict(
            torch.load(os.path.join(ARTIFACTS_DIR, "nn_model.pt"),
                       map_location="cpu")
        )

        # CRITICAL: eval() turns dropout OFF.
        # Without it, predictions are randomly corrupted.
        # This is the most common PyTorch serving bug.
        model.eval()

        return model


# ONE shared instance. Every request uses this same loaded model,
# not a new copy. This pattern is called a singleton.
store = ModelStore()
