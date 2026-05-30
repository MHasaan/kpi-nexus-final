"""Seasonal decomposition using statsmodels seasonal_decompose.

Returns trend, seasonal, resid, period, model. NaN values (produced at the
edges by the convolution-based trend estimation) are converted to None so the
result is always JSON-serialisable.

Period inference heuristic (when period is not supplied):
  - Series length ≥ 24  → try 12 (monthly-style)
  - Series length ≥ 14  → try 7 (weekly-style)
  - Otherwise           → try 4, falling back to 2
"""

from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np

try:
    from statsmodels.tsa.seasonal import seasonal_decompose
except ImportError as exc:  # pragma: no cover
    raise ImportError("statsmodels is required for seasonality decomposition") from exc


def _nan_to_none(arr: np.ndarray) -> list[float | None]:
    """Convert a numpy array to a list, replacing NaN/inf with None."""
    return [None if (v is None or math.isnan(float(v)) or math.isinf(float(v))) else float(v) for v in arr]


def _infer_period(n: int) -> int:
    """Pick a reasonable seasonal period given a series of length *n*."""
    if n >= 24:
        return 12
    if n >= 14:
        return 7
    if n >= 8:
        return 4
    return 2


def decompose(
    series: list[float],
    period: Optional[int] = None,
    model: str = "additive",
) -> dict[str, Any]:
    """Decompose *series* into trend + seasonal + residual components.

    Parameters
    ----------
    series:
        Numeric time-series values (at least 2 × period required).
    period:
        Known seasonal period (e.g. 12 for monthly data with yearly seasonality).
        If *None*, a heuristic based on series length is used.
    model:
        ``"additive"`` (default) or ``"multiplicative"``.

    Returns
    -------
    dict with keys: ``trend``, ``seasonal``, ``resid``, ``period``, ``model``.
    Arrays are plain Python lists with ``None`` where statsmodels produces NaN.

    Raises
    ------
    ValueError
        If the series is too short (< 2 × period).
    """
    n = len(series)
    resolved_period = period if period is not None else _infer_period(n)

    if n < 2 * resolved_period:
        raise ValueError(
            f"Series too short for period={resolved_period}: "
            f"need at least {2 * resolved_period} points, got {n}. "
            "Provide more data or specify a smaller period."
        )

    arr = np.asarray(series, dtype=float)

    result = seasonal_decompose(arr, model=model, period=resolved_period)

    return {
        "trend": _nan_to_none(result.trend),
        "seasonal": _nan_to_none(result.seasonal),
        "resid": _nan_to_none(result.resid),
        "period": resolved_period,
        "model": model,
    }
