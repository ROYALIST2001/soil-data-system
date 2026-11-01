from typing import List
from pydantic import BaseModel, Field


# ---------- ONE DISTRICT'S AVERAGE SOIL ----------
class DistrictSoil(BaseModel):
    district_id: int
    name: str
    avg_n: float
    avg_p: float
    avg_k: float
    avg_ph: float
    reading_count: int


# ---------- WHAT GO SENDS US ----------
class ClusterRequest(BaseModel):
    districts: List[DistrictSoil] = Field(
        ..., description="Average soil for each district with data"
    )

    # How many K values to try. We test K = 2 up to max_k.
    max_k: int = Field(6, ge=2, le=10, description="Largest K to test")


# ---------- ONE GROUP, DESCRIBED ----------
class ClusterInfo(BaseModel):
    cluster_id: int

    # A PLAIN ENGLISH description.
    #
    # WHY? Because "Cluster 0" means nothing to a person.
    # "Low nitrogen, acidic soil" means something they can act on.
    description: str

    district_count: int
    district_names: List[str]

    # The centre of this cluster, in real units.
    centre_n: float
    centre_p: float
    centre_k: float
    centre_ph: float


# ---------- ONE K VALUE WE TESTED ----------
class KEvaluation(BaseModel):
    k: int
    inertia: float          # how TIGHT the clusters are (lower is better)
    silhouette: float       # how SEPARATED they are (higher is better)


# ---------- WHAT WE SEND BACK ----------
class ClusterResponse(BaseModel):
    chosen_k: int
    elbow_k: int            # what the elbow method suggested
    silhouette_score: float
    quality: str            # plain English: "good", "weak", and so on

    clusters: List[ClusterInfo]

    # Which cluster each district ended up in.
    assignments: dict

    # Every K we tested. For the elbow chart in your report.
    evaluations: List[KEvaluation]
