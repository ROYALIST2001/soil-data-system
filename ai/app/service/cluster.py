"""
Service layer: groups districts by soil similarity using K-Means.

This is UNSUPERVISED learning. Unlike Phase 5, there are NO correct
answers to learn from. The algorithm finds structure by itself.
"""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

from app.schema.cluster import (
    ClusterRequest, ClusterResponse, ClusterInfo, KEvaluation,
)


class ClusterError(Exception):
    """Raised when clustering cannot be done. The caller's fault."""
    pass


def _describe_cluster(centre, overall_mean, overall_std) -> str:
    """
    Turn a cluster centre into PLAIN ENGLISH.

    WHY? Because "Cluster 0" means nothing to an authority.
    "Low nitrogen, acidic soil" tells them what to do.
    """
    n, p, k, ph = centre
    parts = []

    # ---------- pH ----------
    # These are absolute agricultural thresholds, not relative ones.
    if ph < 5.5:
        parts.append("acidic")
    elif ph > 7.5:
        parts.append("alkaline")

    # ---------- Nutrients ----------
    # Here we compare RELATIVE to the other districts.
    # "Low" means low COMPARED WITH the rest of the country.
    labels = ["nitrogen", "phosphorus", "potassium"]

    for i, label in enumerate(labels):
        value = centre[i]
        mean = overall_mean[i]
        std = overall_std[i]

        # Guard against divide-by-zero if every district is identical.
        if std < 0.001:
            continue

        # How many standard deviations from the average?
        z = (value - mean) / std

        if z < -0.6:
            parts.append(f"low {label}")
        elif z > 0.6:
            parts.append(f"high {label}")

    if not parts:
        return "balanced soil"

    return ", ".join(parts)


def _quality_word(score: float) -> str:
    """Turn the silhouette number into plain English."""
    if score > 0.7:
        return "very strong grouping"
    if score > 0.5:
        return "good grouping"
    if score > 0.25:
        return "weak but usable grouping"
    return "no clear grouping found"


def cluster_districts(request: ClusterRequest) -> ClusterResponse:
    """Group districts by soil similarity."""

    districts = request.districts
    n_districts = len(districts)

    # ---------- CHECK: do we have enough districts? ----------
    #
    # You cannot make 3 groups from 2 districts.
    # We need at least 4 to make clustering meaningful.
    if n_districts < 4:
        raise ClusterError(
            f"Only {n_districts} districts have data. "
            "At least 4 are needed for clustering. "
            "Collect readings from more districts first."
        )

    # ---------- STEP 1: build the number array ----------
    #
    # NOTE: we cluster by SOIL, not by LOCATION.
    # So two districts 400 km apart CAN be in the same group,
    # if their soil is similar.
    features = np.array([
        [d.avg_n, d.avg_p, d.avg_k, d.avg_ph]
        for d in districts
    ])

    # ---------- STEP 2: SCALE ----------
    #
    # CRITICAL. Look at the ranges:
    #   potassium: 5 to 320
    #   pH:        4 to 9
    #
    # Two districts differing by K=100 and pH=3.
    # AGRICULTURALLY the pH difference is huge.
    # But K-Means would see 100 versus 3, and potassium
    # would COMPLETELY DOMINATE. pH would be ignored.
    #
    # We use StandardScaler (centre 0, spread 1), NOT MinMax.
    # WHY? K-Means uses DISTANCE. StandardScaler makes every
    # feature contribute EQUALLY to distance. MinMax is also
    # more sensitive to a single extreme outlier.
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)

    # ---------- STEP 3: try every K ----------
    #
    # K-Means CANNOT tell you how many groups exist.
    # You must choose K. So we test several and measure.
    #
    # The largest K we can test is n_districts - 1.
    max_k = min(request.max_k, n_districts - 1)

    evaluations = []
    best_k = 2
    best_silhouette = -1.0

    for k in range(2, max_k + 1):
        # n_init=10 runs K-Means 10 TIMES with different random
        # starts and keeps the best. This fixes the biggest
        # weakness of K-Means: an unlucky random start.
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(scaled)

        # INERTIA: total squared distance from each point to its centre.
        # Lower means TIGHTER clusters.
        #
        # THE TRAP: inertia ALWAYS falls as K rises. At K = n_districts
        # every point is its own cluster and inertia is 0 - perfect,
        # but completely useless. So we cannot just pick the lowest.
        inertia = float(km.inertia_)

        # SILHOUETTE: for each point, how much closer is it to its own
        # cluster than to the nearest other one?
        #   near +1 -> excellent
        #   near  0 -> sitting on a boundary
        #   near -1 -> in the WRONG cluster
        sil = float(silhouette_score(scaled, labels))

        evaluations.append(KEvaluation(k=k, inertia=round(inertia, 3),
                                       silhouette=round(sil, 3)))

        if sil > best_silhouette:
            best_silhouette = sil
            best_k = k

    # ---------- Find the ELBOW, for the report ----------
    #
    # The elbow is where the inertia curve BENDS: where each extra
    # cluster stops helping much. We find it by looking for where
    # the DROP suddenly becomes small.
    elbow_k = evaluations[0].k

    if len(evaluations) > 2:
        biggest_drop_ratio = 0.0

        for i in range(1, len(evaluations)):
            drop = evaluations[i - 1].inertia - evaluations[i].inertia
            if evaluations[i - 1].inertia > 0:
                ratio = drop / evaluations[i - 1].inertia
                if ratio > biggest_drop_ratio:
                    biggest_drop_ratio = ratio
                    elbow_k = evaluations[i].k

    # ---------- STEP 4: run K-Means with the chosen K ----------
    #
    # WHY does SILHOUETTE decide, and not the elbow?
    # Because the elbow is judged BY EYE. Two people can look at
    # the same curve and pick different elbows. The silhouette
    # gives a NUMBER, and a number can decide automatically.
    # We report the elbow too, for your report's chart.
    final = KMeans(n_clusters=best_k, random_state=42, n_init=10)
    final_labels = final.fit_predict(scaled)

    # Turn the centres back into REAL units, so we can describe them.
    centres_real = scaler.inverse_transform(final.cluster_centers_)

    # ---------- STEP 5: describe each cluster ----------
    overall_mean = features.mean(axis=0)
    overall_std = features.std(axis=0)

    clusters = []
    assignments = {}

    for cluster_id in range(best_k):
        # Which districts landed in this cluster?
        members = [
            districts[i] for i in range(n_districts)
            if final_labels[i] == cluster_id
        ]

        centre = centres_real[cluster_id]

        clusters.append(ClusterInfo(
            cluster_id=cluster_id,
            description=_describe_cluster(centre, overall_mean, overall_std),
            district_count=len(members),
            district_names=[m.name for m in members],
            centre_n=round(float(centre[0]), 2),
            centre_p=round(float(centre[1]), 2),
            centre_k=round(float(centre[2]), 2),
            centre_ph=round(float(centre[3]), 2),
        ))

    # Which cluster each district belongs to.
    for i, d in enumerate(districts):
        assignments[str(d.district_id)] = int(final_labels[i])

    return ClusterResponse(
        chosen_k=best_k,
        elbow_k=elbow_k,
        silhouette_score=round(best_silhouette, 3),
        quality=_quality_word(best_silhouette),
        clusters=clusters,
        assignments=assignments,
        evaluations=evaluations,
    )
