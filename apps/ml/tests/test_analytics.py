"""Tests for forecast (naive), what-if, and correlation pure services."""

import math

from app.services.correlation import correlate
from app.services.forecast import forecast
from app.services.whatif import simulate


def test_forecast_naive_extrapolates_an_upward_trend() -> None:
    values = [10, 20, 30, 40, 50]
    out = forecast(values, horizon=3, model="naive")
    preds = out["predictions"]
    assert len(preds) == 3
    # Linear trend ≈ +10/step → next ≈ 60, 70, 80.
    assert preds[0]["yhat"] > 50
    assert preds[2]["yhat"] > preds[0]["yhat"]
    # Bands widen outward: 95% interval contains the 80% interval.
    p = preds[0]
    assert p["yhat_lower_95"] <= p["yhat_lower_80"] <= p["yhat"] <= p["yhat_upper_80"] <= p["yhat_upper_95"]
    assert "rmse" in out["fitMetrics"]


def test_forecast_handles_too_few_points() -> None:
    out = forecast([42], horizon=3, model="naive")
    assert len(out["predictions"]) == 3
    assert all(p["yhat"] == 42 for p in out["predictions"])  # flat fallback


def test_whatif_multiplicative_lift() -> None:
    out = simulate(baseline=[100, 100, 100], scenarios=[{"deltaPct": 10, "mechanic": "multiplicative"}])
    sc = out["scenarios"][0]
    assert all(math.isclose(v, 110.0, rel_tol=1e-9) for v in sc["values"])
    assert math.isclose(sc["aggregateLift"], 30.0, rel_tol=1e-9)
    assert math.isclose(sc["aggregateLiftPct"], 10.0, rel_tol=1e-9)


def test_whatif_additive_with_floor_and_ceiling() -> None:
    out = simulate(
        baseline=[10, 20, 30],
        scenarios=[{"deltaAbsolute": -15, "mechanic": "additive", "floor": 0, "ceiling": 100}],
    )
    sc = out["scenarios"][0]
    assert sc["values"] == [0, 5, 15]  # 10-15 floored to 0


def test_correlation_detects_perfect_positive_and_negative() -> None:
    out = correlate({"a": [1, 2, 3, 4], "b": [2, 4, 6, 8], "c": [4, 3, 2, 1]}, method="pearson")
    pairs = {(p["a"], p["b"]): p["r"] for p in out["pairs"]}
    assert math.isclose(pairs[("a", "b")], 1.0, abs_tol=1e-9)
    assert math.isclose(pairs[("a", "c")], -1.0, abs_tol=1e-9)


def test_correlation_requires_two_series() -> None:
    out = correlate({"a": [1, 2, 3]}, method="pearson")
    assert out["pairs"] == []
