"""Keep the pinned Prophet stack able to fit and predict (OT-005).

prophet 1.1.6 shipped a CmdStan tree that cmdstanpy 1.3 rejects, so Prophet
failed on construction while every import still succeeded.
"""

import logging

import numpy as np
import pandas as pd


def test_prophet_fits_and_predicts_a_daily_series() -> None:
    # Import inside the test so a broken Stan backend is reported directly.
    from prophet import Prophet

    logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
    ds = pd.date_range("2026-01-01", periods=60, freq="D")
    y = 100 + 0.5 * np.arange(60) + 5 * np.sin(np.arange(60) * 2 * np.pi / 7)
    model = Prophet(interval_width=0.95)
    model.fit(pd.DataFrame({"ds": ds, "y": y}))

    future = model.predict(model.make_future_dataframe(periods=7)).tail(7)

    assert len(future) == 7
    assert (future["yhat_lower"] <= future["yhat"]).all()
    assert (future["yhat"] <= future["yhat_upper"]).all()
    # Trend of +0.5/day continues past the last observed value (~129.5).
    assert future["yhat"].mean() > 125
