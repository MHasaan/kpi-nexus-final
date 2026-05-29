"""Pairwise correlation across named numeric series (Pearson or Spearman)."""

from __future__ import annotations

from itertools import combinations
from typing import Any

from scipy import stats


def correlate(series: dict[str, list[float]], method: str = "pearson") -> dict[str, Any]:
    names = list(series.keys())
    pairs: list[dict[str, Any]] = []
    for a, b in combinations(names, 2):
        xa, xb = series[a], series[b]
        n = min(len(xa), len(xb))
        if n < 2:
            continue
        fn = stats.spearmanr if method == "spearman" else stats.pearsonr
        result = fn(xa[:n], xb[:n])
        # Both pearsonr and spearmanr return (statistic, pvalue).
        r = float(result[0])
        p = float(result[1])
        pairs.append({"a": a, "b": b, "r": r, "p": p})
    return {"method": method, "pairs": pairs}
