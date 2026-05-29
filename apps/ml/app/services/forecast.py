"""Forecasting service.

Only the NAIVE model (linear trend + residual-based confidence bands) is
implemented here — Prophet and ARIMA need a heavier toolchain (prophet/
statsmodels, a C++ compiler) that is intentionally deferred; requests for those
models fall back to naive. The naive model is honest about uncertainty: bands
come from the in-sample residual standard deviation.
"""

from __future__ import annotations

from typing import Any

import numpy as np

# z-multipliers for 80% and 95% prediction intervals (two-sided normal).
Z80 = 1.2816
Z95 = 1.9600


def forecast(values: list[float], horizon: int, model: str = "naive") -> dict[str, Any]:
    arr = np.asarray([v for v in values if np.isfinite(v)], dtype=float)
    horizon = max(1, int(horizon))

    if arr.size < 2:
        # Flat fallback: repeat the single known value (or 0) with zero-width bands.
        base = float(arr[0]) if arr.size == 1 else 0.0
        preds = [
            {
                "ds": f"t+{h}",
                "yhat": base,
                "yhat_lower_80": base,
                "yhat_upper_80": base,
                "yhat_lower_95": base,
                "yhat_upper_95": base,
            }
            for h in range(1, horizon + 1)
        ]
        return {"predictions": preds, "fitMetrics": {"rmse": 0.0, "mape": 0.0}, "model": "naive"}

    n = arr.size
    x = np.arange(n)
    slope, intercept = np.polyfit(x, arr, 1)
    fitted = slope * x + intercept
    resid = arr - fitted
    rmse = float(np.sqrt(np.mean(resid**2)))
    nonzero = arr != 0
    mape = float(np.mean(np.abs(resid[nonzero] / arr[nonzero])) * 100) if nonzero.any() else 0.0
    sigma = float(resid.std()) or rmse

    preds: list[dict[str, Any]] = []
    for h in range(1, horizon + 1):
        yhat = float(slope * (n - 1 + h) + intercept)
        preds.append(
            {
                "ds": f"t+{h}",
                "yhat": yhat,
                "yhat_lower_80": yhat - Z80 * sigma,
                "yhat_upper_80": yhat + Z80 * sigma,
                "yhat_lower_95": yhat - Z95 * sigma,
                "yhat_upper_95": yhat + Z95 * sigma,
            }
        )
    # `model` echoes naive even when prophet/arima were requested (deferred).
    return {"predictions": preds, "fitMetrics": {"rmse": rmse, "mape": mape}, "model": "naive"}
