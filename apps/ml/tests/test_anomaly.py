"""Anomaly detector tests — known seasonal/spike patterns with ground truth."""

from app.services.anomaly import detect


def test_zscore_flags_a_clear_spike() -> None:
    values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9]  # spike at index 9
    result = detect(values, method="zscore", threshold=3.0)
    flagged = {a["index"] for a in result["anomalies"]}
    assert 9 in flagged


def test_zscore_clean_stationary_series_has_no_anomalies() -> None:
    values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 10, 11, 9]
    result = detect(values, method="zscore", threshold=3.0)
    assert result["anomalies"] == []


def test_ensemble_flags_the_spike_and_reports_method_hits() -> None:
    values = [5, 6, 5, 5, 6, 4, 5, 6, 5, 80, 5, 6]
    result = detect(values, method="ensemble", threshold=3.0)
    flagged = {a["index"] for a in result["anomalies"]}
    assert 9 in flagged
    spike = next(a for a in result["anomalies"] if a["index"] == 9)
    assert "methodHits" in spike
    assert spike["score"] > 0


def test_isolation_forest_flags_the_spike() -> None:
    values = [5, 6, 5, 5, 6, 4, 5, 6, 5, 80, 5, 6, 5, 6, 4]
    result = detect(values, method="isolation_forest")
    flagged = {a["index"] for a in result["anomalies"]}
    assert 9 in flagged


def test_short_or_empty_series_yields_no_anomalies() -> None:
    assert detect([], method="ensemble")["anomalies"] == []
    assert detect([5], method="zscore")["anomalies"] == []


def test_higher_threshold_suppresses_borderline_points() -> None:
    values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 25, 10, 9]  # mild outlier at 9
    loose = {a["index"] for a in detect(values, method="zscore", threshold=2.0)["anomalies"]}
    strict = {a["index"] for a in detect(values, method="zscore", threshold=4.0)["anomalies"]}
    assert 9 in loose
    assert 9 not in strict
