"""
Soil Data Management System - Training Dataset Generator
Builds a regression dataset: 7 features -> 3 labels (N, P, K need in kg/ha)
Based on the NEED - HAVE = GAP relationship from the project document.
"""

import numpy as np
import pandas as pd

np.random.seed(42)

# ----------------------------------------------------------------------
# 1. AGRO-ECOLOGICAL ZONES OF SRI LANKA
#    Each zone has different typical soil chemistry.
#    (soil_n mean/sd, soil_p mean/sd, soil_k mean/sd, ph mean/sd, weight)
# ----------------------------------------------------------------------
ZONES = {
    # Wet Zone: high rainfall leaches bases -> acidic, lower K
    "wet":          dict(n=(55, 22), p=(14, 7),  k=(60, 28),  ph=(5.3, 0.55), w=0.35),
    # Dry Zone: less leaching -> neutral to alkaline, higher K
    "dry":          dict(n=(35, 16), p=(11, 6),  k=(130, 50), ph=(7.2, 0.60), w=0.40),
    # Intermediate Zone
    "intermediate": dict(n=(45, 18), p=(13, 6),  k=(95, 38),  ph=(6.3, 0.50), w=0.25),
}

# ----------------------------------------------------------------------
# 2. CROP REQUIREMENT TABLE
#    N, P, K = ELEMENTAL kg/ha needed for the BASE yield
#    base   = typical yield t/ha
#    maxy   = realistic maximum yield t/ha (the cap)
#    zones  = which zones this crop is actually grown in
# ----------------------------------------------------------------------
CROPS = {
    "rice":     dict(n=120, p=26,  k=50,  base=4.5,  maxy=8.0,
                     zones=["wet", "dry", "intermediate"]),
    "maize":    dict(n=135, p=31,  k=58,  base=6.0,  maxy=10.0,
                     zones=["dry", "intermediate"]),
    "tea":      dict(n=200, p=30,  k=90,  base=2.0,  maxy=3.5,
                     zones=["wet", "intermediate"]),
    "coconut":  dict(n=80,  p=35,  k=120, base=10.0, maxy=18.0,
                     zones=["dry", "intermediate"]),
    "banana":   dict(n=200, p=45,  k=300, base=30.0, maxy=60.0,
                     zones=["wet", "intermediate"]),
    "chilli":   dict(n=100, p=40,  k=60,  base=3.0,  maxy=6.0,
                     zones=["dry", "intermediate"]),
    "potato":   dict(n=150, p=70,  k=150, base=18.0, maxy=30.0,
                     zones=["wet", "intermediate"]),
    "cabbage":  dict(n=180, p=60,  k=100, base=25.0, maxy=45.0,
                     zones=["wet", "intermediate"]),
    "tomato":   dict(n=120, p=50,  k=100, base=20.0, maxy=40.0,
                     zones=["dry", "intermediate"]),
    "bigonion": dict(n=110, p=45,  k=75,  base=15.0, maxy=25.0,
                     zones=["dry"]),
}

# ----------------------------------------------------------------------
# 3. GROWTH STAGE FACTORS (split application)
# ----------------------------------------------------------------------
STAGES = {
    "seedling":   0.20,
    "vegetative": 0.50,
    "flowering":  0.30,
    "maturity":   0.10,
}

# ----------------------------------------------------------------------
# 4. CONVERSION CONSTANTS
# ----------------------------------------------------------------------
MG_KG_TO_KG_HA = 2.0    # 20 cm depth, typical bulk density (approximation)
N_UPTAKE  = 0.40        # fraction of soil N a single crop can draw in one season
P_UPTAKE  = 0.22        # P is strongly fixed by iron, aluminium and calcium
K_UPTAKE  = 0.22        # most soil K is held on clay and is not readily exchangeable

ROWS_PER_CROP = 300
NOISE_PCT = 0.06        # 6% measurement / field variability


def ph_availability(ph, nutrient):
    """
    How much of the soil nutrient the plant can actually absorb,
    as a factor 0..1, depending on pH.
    Optimum is around 6.5 for most nutrients.
    Phosphorus is far more pH-sensitive than N and K.
    """
    if nutrient == "p":
        # P is locked up by iron/aluminium below 5.5 and by calcium above 7.5
        if ph < 6.0:
            f = 1.0 - (6.0 - ph) * 0.22
        elif ph > 7.0:
            f = 1.0 - (ph - 7.0) * 0.18
        else:
            f = 1.0
        return float(np.clip(f, 0.25, 1.0))
    else:
        # N and K are less sensitive
        f = 1.0 - abs(ph - 6.5) * 0.07
        return float(np.clip(f, 0.60, 1.0))


rows = []

zone_names = list(ZONES.keys())
zone_weights = np.array([ZONES[z]["w"] for z in zone_names])
zone_weights = zone_weights / zone_weights.sum()

for crop_name, crop in CROPS.items():
    # only sample zones where this crop is actually grown
    allowed = crop["zones"]
    sub_w = np.array([ZONES[z]["w"] for z in allowed])
    sub_w = sub_w / sub_w.sum()

    for _ in range(ROWS_PER_CROP):
        zone = np.random.choice(allowed, p=sub_w)
        z = ZONES[zone]

        # ---------- SOIL MEASUREMENTS (the HAVE side) ----------
        soil_n = np.random.normal(*z["n"])
        soil_p = np.random.normal(*z["p"])
        soil_k = np.random.normal(*z["k"])
        soil_ph = np.random.normal(*z["ph"])

        # keep them physically sensible
        soil_n = float(np.clip(soil_n, 2, 250))
        soil_p = float(np.clip(soil_p, 1, 90))
        soil_k = float(np.clip(soil_k, 5, 320))
        soil_ph = float(np.clip(soil_ph, 3.8, 8.8))

        # ---------- CROP CONTEXT ----------
        stage = np.random.choice(list(STAGES.keys()))
        stage_f = STAGES[stage]

        # target yield: around the base, never above the realistic cap
        ty = np.random.normal(crop["base"] * 1.05, crop["base"] * 0.18)
        ty = float(np.clip(ty, crop["base"] * 0.5, crop["maxy"]))

        yield_f = ty / crop["base"]

        # ---------- NEED ----------
        need_n = crop["n"] * yield_f * stage_f
        need_p = crop["p"] * yield_f * stage_f
        need_k = crop["k"] * yield_f * stage_f

        # ---------- HAVE (plant-available, pH adjusted) ----------
        have_n = soil_n * MG_KG_TO_KG_HA * N_UPTAKE * ph_availability(soil_ph, "n")
        have_p = soil_p * MG_KG_TO_KG_HA * P_UPTAKE * ph_availability(soil_ph, "p")
        have_k = soil_k * MG_KG_TO_KG_HA * K_UPTAKE * ph_availability(soil_ph, "k")

        # only the share of soil supply relevant to THIS stage is counted
        have_n *= stage_f
        have_p *= stage_f
        have_k *= stage_f

        # ---------- GAP = NEED - HAVE ----------
        gap_n = max(need_n - have_n, 0.0)
        gap_p = max(need_p - have_p, 0.0)
        gap_k = max(need_k - have_k, 0.0)

        # ---------- realistic noise ----------
        # real soil tests and real fields are never perfectly predictable
        gap_n = max(gap_n * np.random.normal(1.0, NOISE_PCT), 0.0)
        gap_p = max(gap_p * np.random.normal(1.0, NOISE_PCT), 0.0)
        gap_k = max(gap_k * np.random.normal(1.0, NOISE_PCT), 0.0)

        rows.append({
            "soil_n": round(soil_n, 1),
            "soil_p": round(soil_p, 1),
            "soil_k": round(soil_k, 1),
            "soil_ph": round(soil_ph, 2),
            "crop": crop_name,
            "stage": stage,
            "target_yield": round(ty, 2),
            "zone": zone,
            "need_n": round(gap_n, 2),
            "need_p": round(gap_p, 2),
            "need_k": round(gap_k, 2),
        })

df = pd.DataFrame(rows)
df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)  # shuffle

df.to_csv("training_data.csv", index=False)

# ----------------------------------------------------------------------
# REPORT
# ----------------------------------------------------------------------
print("=" * 62)
print("DATASET BUILT")
print("=" * 62)
print("Rows   :", len(df))
print("Crops  :", df['crop'].nunique())
print("Zones  :", df['zone'].value_counts().to_dict())
print()
print(df.head(8).to_string(index=False))
print()
print("=" * 62)
print("LABEL CHECK")
print("=" * 62)
for c in ["need_n", "need_p", "need_k"]:
    v = df[c]
    zeros = (v == 0).sum()
    print(f"{c}: min {v.min():7.1f} | max {v.max():7.1f} | mean {v.mean():7.1f} "
          f"| std {v.std():6.1f} | zeros {100*zeros/len(v):5.1f}%")
