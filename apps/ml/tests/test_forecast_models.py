"""Prophet and ARIMA forecasts (OT-005).

The response contract is the naive one: `predictions` with yhat and nested
80/95% bands, `fitMetrics` (rmse, mape), and `model` naming what actually ran.
"""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.services.forecast import forecast


def _daily(n: int) -> list[str]:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def _weekly_pattern(n: int) -> list[float]:
    t = np.arange(n)
    noise = np.random.default_rng(1).normal(0, 0.5, n)
    return list(100 + 0.2 * t + 8 * np.sin(2 * np.pi * t / 7) + noise)


def _assert_bands(preds: list[dict]) -> None:
    for p in preds:
        assert p["yhat_lower_95"] <= p["yhat_lower_80"] <= p["yhat"] <= p["yhat_upper_80"] <= p["yhat_upper_95"]


@pytest.mark.parametrize("model", ["prophet", "arima"])
def test_model_runs_and_reports_itself(model: str) -> None:
    out = forecast(_weekly_pattern(90), horizon=14, model=model, timestamps=_daily(90))
    assert out["model"] == model
    assert len(out["predictions"]) == 14
    _assert_bands(out["predictions"])
    assert out["fitMetrics"]["rmse"] >= 0


def test_prophet_uses_the_series_dates_and_spacing() -> None:
    out = forecast(_weekly_pattern(90), horizon=3, model="prophet", timestamps=_daily(90))
    # Last point is 2026-03-31; the next three days follow it.
    assert [p["ds"] for p in out["predictions"]] == ["2026-04-01", "2026-04-02", "2026-04-03"]


def test_prophet_follows_monthly_spacing() -> None:
    stamps = [datetime(2026, m, 1, tzinfo=timezone.utc).isoformat() for m in range(1, 13)]
    stamps += [datetime(2027, m, 1, tzinfo=timezone.utc).isoformat() for m in range(1, 13)]
    out = forecast([float(v) for v in range(24)], horizon=14, model="prophet", timestamps=stamps)
    assert out["model"] == "prophet"
    # Calendar months, not a fixed 31 days that drifts off the 1st.
    labels = [p["ds"] for p in out["predictions"]]
    assert labels[:3] == ["2028-01-01", "2028-02-01", "2028-03-01"]
    assert labels[-1] == "2029-02-01"


def test_arima_labels_quarterly_periods() -> None:
    stamps = [datetime(2020 + q // 4, 1 + 3 * (q % 4), 1, tzinfo=timezone.utc).isoformat() for q in range(16)]
    out = forecast([float(10 + (q % 4)) for q in range(16)], horizon=3, model="arima", timestamps=stamps)
    assert [p["ds"] for p in out["predictions"]] == ["2024-01-01", "2024-04-01", "2024-07-01"]


def test_prophet_captures_weekly_seasonality_better_than_naive() -> None:
    values, stamps = _weekly_pattern(120), _daily(120)
    prophet = forecast(values, horizon=7, model="prophet", timestamps=stamps)
    naive = forecast(values, horizon=7, model="naive", timestamps=stamps)
    assert prophet["fitMetrics"]["rmse"] < naive["fitMetrics"]["rmse"] / 2


def test_arima_follows_an_autoregressive_series() -> None:
    rng = np.random.default_rng(7)
    y = [50.0]
    for _ in range(149):
        y.append(50 + 0.8 * (y[-1] - 50) + rng.normal(0, 1))
    out = forecast(y, horizon=30, model="arima")
    assert out["model"] == "arima"
    # Mean-reverting: the long-range forecast settles near the series mean.
    assert abs(out["predictions"][-1]["yhat"] - 50) < 3
    # Uncertainty grows with the horizon.
    first, last = out["predictions"][0], out["predictions"][-1]
    assert last["yhat_upper_95"] - last["yhat_lower_95"] > first["yhat_upper_95"] - first["yhat_lower_95"]


@pytest.mark.parametrize("model", ["prophet", "arima"])
def test_short_series_fall_back_to_naive(model: str) -> None:
    out = forecast([10.0, 11.0, 12.0], horizon=2, model=model, timestamps=_daily(3))
    assert out["model"] == "naive"
    assert len(out["predictions"]) == 2


def test_prophet_without_timestamps_falls_back_to_naive() -> None:
    out = forecast(_weekly_pattern(60), horizon=2, model="prophet")
    assert out["model"] == "naive"


def test_unknown_model_still_falls_back_to_naive() -> None:
    out = forecast(_weekly_pattern(30), horizon=2, model="lstm")
    assert out["model"] == "naive"


@pytest.mark.parametrize("model", ["prophet", "arima"])
def test_constant_series_does_not_crash(model: str) -> None:
    out = forecast([5.0] * 40, horizon=3, model=model, timestamps=_daily(40))
    assert len(out["predictions"]) == 3
    assert all(abs(p["yhat"] - 5.0) < 1e-6 for p in out["predictions"])
