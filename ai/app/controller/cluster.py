"""
Controller layer: the front door for /cluster.
It receives the request and sends the reply. No thinking.
"""

from fastapi import APIRouter, HTTPException

from app.schema.cluster import ClusterRequest, ClusterResponse
from app.service import cluster as cluster_service
from app.service.cluster import ClusterError

router = APIRouter()


@router.post("/cluster", response_model=ClusterResponse)
def cluster_endpoint(request: ClusterRequest):
    """Group districts by soil similarity using K-Means."""

    try:
        return cluster_service.cluster_districts(request)

    except ClusterError as e:
        # Not enough districts. The CALLER's problem.
        # 400 Bad Request, with the real message so they can fix it.
        raise HTTPException(status_code=400, detail=str(e))

    except Exception:
        # Something else broke. Do NOT leak the internal message,
        # because it can reveal how the service is built.
        raise HTTPException(status_code=500, detail="Clustering failed.")
