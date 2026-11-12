"""Forecasting service: naive, Prophet and ARIMA (OT-005).

Every model returns the same shape: `predictions` (yhat with nested 80/95%
bands), in-sample `fitMetrics` (rmse, mape) and `model`, which names the model
that actually ran. Prophet and ARIMA need enough history (and Prophet needs
dates); otherwise, for a flat series, or if a fit fails, the request falls back
to naive and says so. The naive model is a linear trend whose bands come from
the in-sample residual standard deviation.

The horizon counts future points at the series' own spacing (the median gap
between timestamps), so monthly data forecasts months, not days.
"""

from __future__ import annotations

import itertools
import logging
import warnings
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# z-multipliers for 80% and 95% prediction intervals (two-sided normal).
Z80 = 1.2816
Z95 = 1.9600

# Fewer points than this cannot support a seasonal or ARMA fit worth showing.
MIN_POINTS = 10
# Bound fitting cost: the API sends at most 365 points; the sidecar allows more.
MAX_FIT_POINTS = 2000
ARIMA_ORDERS = list(itertools.product(range(3), range(2), range(3)))


def forecast(
    values: list[float],
    horizon: int,
    model: str = "naive",
    timestamps: Optional[list[str]] = None,
) -> dict[str, Any]:
    horizon = max(1, int(horizon))
    arr, ds = _clean(values, timestamps)
    requested = model.lower()

    if requested in ("prophet", "arima") and arr.size >= MIN_POINTS and np.ptp(arr) > 0:
        arr, ds = arr[-MAX_FIT_POINTS:], (ds[-MAX_FIT_POINTS:] if ds is not None else None)
        try:
            if requested == "prophet" and ds is not None:
                return _prophet(arr, ds, horizon)
            if requested == "arima":
                return _arima(arr, ds, horizon)
        except Exception:  # noqa: BLE001 - any fit failure degrades to naive, reported as such
            logger.warning("%s fit failed; falling back to naive", requested, exc_info=True)
    return _naive(arr, horizon)


def _clean(values: list[float], timestamps: Optional[list[str]]) -> tuple[np.ndarray, Optional[pd.DatetimeIndex]]:
    """Drop non-finite values, keeping timestamps aligned; unusable timestamps become None."""
    raw = np.asarray(values, dtype=float)
    keep = np.isfinite(raw)
    ds: Optional[pd.DatetimeIndex] = None
    if timestamps is not None and len(timestamps) == raw.size:
        try:
            parsed = pd.DatetimeIndex(pd.to_datetime(timestamps, utc=True)).tz_localize(None)
            kept = parsed[keep]
            if kept.is_monotonic_increasing and not kept.has_duplicates:
                ds = kept
        except (ValueError, TypeError):
            ds = None
    return raw[keep], ds


def _metrics(actual: np.ndarray, fitted: np.ndarray) -> dict[str, float]:
    resid = actual - fitted
    rmse = float(np.sqrt(np.mean(resid**2)))
    nonzero = actual != 0
    mape = float(np.mean(np.abs(resid[nonzero] / actual[nonzero])) * 100) if nonzero.any() else 0.0
    return {"rmse": rmse, "mape": mape}


def _future_dates(ds: pd.DatetimeIndex, horizon: int) -> pd.DatetimeIndex:
    """The next `horizon` dates at the series' median spacing.

    Monthly, quarterly and yearly series step by calendar months, so a series of
    month starts continues on the 1st instead of drifting by a fixed 31 days.
    """
    step = pd.Series(ds).diff().median()
    if not step > pd.Timedelta(0):
        raise ValueError("timestamps have no positive spacing")
    days = step / pd.Timedelta(days=1)
    for months, low, high in ((1, 27, 32), (3, 88, 93), (12, 360, 370)):
        if low <= days <= high:
            return pd.DatetimeIndex([ds[-1] + pd.DateOffset(months=months * h) for h in range(1, horizon + 1)])
    return pd.DatetimeIndex([ds[-1] + step * h for h in range(1, horizon + 1)])


def _future_labels(ds: Optional[pd.DatetimeIndex], horizon: int) -> list[str]:
    if ds is None:
        return [f"t+{h}" for h in range(1, horizon + 1)]
    future = _future_dates(ds, horizon)
    if pd.Series(ds).diff().median() >= pd.Timedelta(days=1):
        return [d.date().isoformat() for d in future]
    return [d.isoformat() for d in future]


def _naive(arr: np.ndarray, horizon: int) -> dict[str, Any]:
    if arr.size < 2:
        # Flat fallback: repeat the single known value (or 0) with zero-width bands.
        base = float(arr[0]) if arr.size == 1 else 0.0
        preds = [_point(f"t+{h}", base, base, base, base, base) for h in range(1, horizon + 1)]
        return {"predictions": preds, "fitMetrics": {"rmse": 0.0, "mape": 0.0}, "model": "naive"}

    n = arr.size
    x = np.arange(n)
    slope, intercept = np.polyfit(x, arr, 1)
    fitted = slope * x + intercept
    metrics = _metrics(arr, fitted)
    sigma = float((arr - fitted).std()) or metrics["rmse"]

    preds = []
    for h in range(1, horizon + 1):
        yhat = float(slope * (n - 1 + h) + intercept)
        preds.append(_point(f"t+{h}", yhat, yhat - Z80 * sigma, yhat + Z80 * sigma, yhat - Z95 * sigma, yhat + Z95 * sigma))
    return {"predictions": preds, "fitMetrics": metrics, "model": "naive"}


def _prophet(arr: np.ndarray, ds: pd.DatetimeIndex, horizon: int) -> dict[str, Any]:
    from prophet import Prophet  # heavy import; only paid when Prophet is requested

    logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
    future = _future_dates(ds, horizon)  # raises (→ naive) before a fit on unusable spacing

    m = Prophet(interval_width=0.95)
    m.fit(pd.DataFrame({"ds": ds, "y": arr}))
    np.random.seed(0)  # Prophet samples its intervals; keep repeat runs identical
    out = m.predict(pd.DataFrame({"ds": ds.append(future)}))

    fitted = out["yhat"].to_numpy()[: arr.size]
    tail = out.iloc[arr.size :]
    labels = _future_labels(ds, horizon)
    preds = []
    for label, (_, row) in zip(labels, tail.iterrows()):
        yhat, lo95, hi95 = float(row["yhat"]), float(row["yhat_lower"]), float(row["yhat_upper"])
        # Prophet gives one interval; the 80% band scales its half-widths.
        scale = Z80 / Z95
        preds.append(_point(label, yhat, yhat - (yhat - lo95) * scale, yhat + (hi95 - yhat) * scale, lo95, hi95))
    return {"predictions": preds, "fitMetrics": _metrics(arr, fitted), "model": "prophet"}


def _arima(arr: np.ndarray, ds: Optional[pd.DatetimeIndex], horizon: int) -> dict[str, Any]:
    from statsmodels.tsa.arima.model import ARIMA

    best = None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # convergence chatter on poor orders; AIC picks the winner
        for p, d, q in ARIMA_ORDERS:
            try:
                res = ARIMA(arr, order=(p, d, q), trend="c" if d == 0 else "n").fit()
            except Exception:  # noqa: BLE001 - an order that cannot be fitted is skipped
                continue
            if np.isfinite(res.aic) and (best is None or res.aic < best[0].aic):
                best = (res, d)
    if best is None:
        raise ValueError("no ARIMA order could be fitted")

    res, d = best
    fc = res.get_forecast(horizon)
    mean = np.asarray(fc.predicted_mean)
    ci95 = np.asarray(fc.conf_int(alpha=0.05))
    ci80 = np.asarray(fc.conf_int(alpha=0.20))
    # The first d fitted values of a differenced model are start-up artefacts.
    metrics = _metrics(arr[d:], np.asarray(res.fittedvalues)[d:])
    labels = _future_labels(ds, horizon)
    preds = [
        _point(labels[i], float(mean[i]), float(ci80[i, 0]), float(ci80[i, 1]), float(ci95[i, 0]), float(ci95[i, 1]))
        for i in range(horizon)
    ]
    return {"predictions": preds, "fitMetrics": metrics, "model": "arima"}


def _point(ds: str, yhat: float, lo80: float, hi80: float, lo95: float, hi95: float) -> dict[str, Any]:
    return {
        "ds": ds,
        "yhat": yhat,
        "yhat_lower_80": lo80,
        "yhat_upper_80": hi80,
        "yhat_lower_95": lo95,
        "yhat_upper_95": hi95,
    }
