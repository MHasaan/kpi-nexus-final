"""Request validation for the ML routers (BE-024).

FastAPI turns a pydantic ValidationError into a 422, so validating the models
directly covers what the endpoints accept.
"""

import pytest
from pydantic import ValidationError

from app.routers.anomaly import AnomalyRequest
from app.routers.correlation import CorrelationRequest
from app.routers.forecast import ForecastRequest
from app.routers.seasonality import SeasonalityRequest
from app.routers.whatif import WhatIfRequest


@pytest.mark.parametrize("horizon", [0, -5, 366, 1_000_000])
def test_forecast_rejects_out_of_range_horizon(horizon: int) -> None:
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"values": [1, 2, 3], "horizon": horizon})


def test_forecast_rejects_an_empty_series() -> None:
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"values": [], "horizon": 7})


def test_forecast_keeps_free_form_model_names_for_the_naive_fallback() -> None:
    req = ForecastRequest.model_validate({"values": [1, 2, 3], "horizon": 365, "model": "prophet"})
    assert req.horizon == 365


def test_anomaly_rejects_an_unknown_method_and_non_positive_threshold() -> None:
    with pytest.raises(ValidationError):
        AnomalyRequest.model_validate({"values": [1, 2, 3], "method": "magic"})
    with pytest.raises(ValidationError):
        AnomalyRequest.model_validate({"values": [1, 2, 3], "threshold": 0})
    assert AnomalyRequest.model_validate({"values": [1, 2, 3], "method": "zscore"}).method == "zscore"


def test_correlation_rejects_unequal_lengths_unknown_method_and_single_series() -> None:
    with pytest.raises(ValidationError):
        CorrelationRequest.model_validate({"series": {"a": [1, 2, 3], "b": [1, 2]}})
    with pytest.raises(ValidationError):
        CorrelationRequest.model_validate({"series": {"a": [1, 2], "b": [3, 4]}, "method": "kendall"})
    with pytest.raises(ValidationError):
        CorrelationRequest.model_validate({"series": {"a": [1, 2, 3]}})
    assert CorrelationRequest.model_validate({"series": {"a": [1, 2], "b": [3, 4]}}).method == "pearson"


def test_seasonality_rejects_bad_period_and_model() -> None:
    with pytest.raises(ValidationError):
        SeasonalityRequest.model_validate({"series": [1.0] * 10, "period": 1})
    with pytest.raises(ValidationError):
        SeasonalityRequest.model_validate({"series": [1.0] * 10, "model": "cubic"})


def test_series_length_is_capped() -> None:
    with pytest.raises(ValidationError):
        ForecastRequest.model_validate({"values": [1.0] * 100_001, "horizon": 7})
    with pytest.raises(ValidationError):
        WhatIfRequest.model_validate({"baseline": {"values": [1.0, 2.0]}, "scenarios": [{}] * 51})
