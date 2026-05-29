"""Pure anomaly detection over a numeric series.

Three complementary methods plus an ensemble:
  - zscore: distance from the mean in population-std units (mean ± k·σ).
  - ewma:   distance from an exponentially-weighted moving average, in units of
            the EWM standard deviation (catches level shifts a global z misses).
  - isolation_forest: sklearn's tree-based outlier score (non-parametric).
  - ensemble: a point is anomalous when ≥2 of the methods flag it; the score is
            the mean of the normalized per-method scores.

Kept free of FastAPI so the statistics are unit-testable in isolation.
"""

from __future__ import annotations

from typing import Any

import numpy as np

MIN_POINTS = 2


def _clean(values: list[float]) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    return arr[np.isfinite(arr)]


def zscore_scores(values: list[float]) -> np.ndarray:
    arr = _clean(values)
    if arr.size < MIN_POINTS:
        return np.zeros(len(values))
    mean = arr.mean()
    std = arr.std()  # population std
    if std == 0:
        return np.zeros(len(values))
    return np.abs(np.asarray(values, dtype=float) - mean) / std


def ewma_scores(values: list[float], span: int = 5) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    n = arr.size
    if n < MIN_POINTS:
        return np.zeros(n)
    alpha = 2.0 / (span + 1.0)
    ewma = np.empty(n)
    ewma[0] = arr[0]
    for i in range(1, n):
        ewma[i] = alpha * arr[i] + (1 - alpha) * ewma[i - 1]
    resid = arr - ewma
    std = resid.std()
    if std == 0:
        return np.zeros(n)
    return np.abs(resid) / std


def isolation_forest_scores(values: list[float]) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    n = arr.size
    if n < MIN_POINTS:
        return np.zeros(n)
    from sklearn.ensemble import IsolationForest

    model = IsolationForest(random_state=0, contamination="auto")
    model.fit(arr.reshape(-1, 1))
    # Higher = more anomalous. score_samples is higher for inliers, so negate.
    return -model.score_samples(arr.reshape(-1, 1))


def detect(
    values: list[float],
    method: str = "ensemble",
    threshold: float = 3.0,
) -> dict[str, Any]:
    """Return {anomalies: [{index, score, methodHits}]} for the chosen method."""
    n = len(values)
    if n < MIN_POINTS:
        return {"anomalies": []}

    z = zscore_scores(values)
    e = ewma_scores(values)
    iso = isolation_forest_scores(values)

    # Per-method boolean hits.
    z_hit = z >= threshold
    e_hit = e >= threshold
    # IsolationForest: flag the upper tail (mean + 2·std of its score).
    iso_cut = iso.mean() + 2 * iso.std() if iso.std() > 0 else np.inf
    iso_hit = iso >= iso_cut

    anomalies: list[dict[str, Any]] = []
    for i in range(n):
        hits = {
            "zscore": float(z[i]),
            "ewma": float(e[i]),
            "isolation_forest": float(iso[i]),
        }
        if method == "zscore":
            flagged, score = bool(z_hit[i]), float(z[i])
        elif method == "ewma":
            flagged, score = bool(e_hit[i]), float(e[i])
        elif method == "isolation_forest":
            flagged, score = bool(iso_hit[i]), float(iso[i])
        else:  # ensemble — majority vote of the three
            votes = int(z_hit[i]) + int(e_hit[i]) + int(iso_hit[i])
            flagged = votes >= 2
            # normalized mean score (z and ewma divided by threshold)
            score = float(np.mean([z[i] / threshold, e[i] / threshold, iso[i]]))
        if flagged:
            anomalies.append({"index": i, "score": score, "methodHits": hits})
    return {"anomalies": anomalies}
