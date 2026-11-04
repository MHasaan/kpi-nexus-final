"""Keep the pinned statsmodels stack importable with resolved SciPy wheels."""

import numpy as np
import pytest


def test_statsmodels_api_import_and_linear_fit() -> None:
    # Import inside the test so SciPy compatibility failures are reported directly.
    import statsmodels.api as sm

    x = np.arange(8, dtype=float)
    y = 3.0 + 2.0 * x
    fit = sm.OLS(y, sm.add_constant(x)).fit()

    assert fit.params == pytest.approx([3.0, 2.0])
    assert fit.predict([[1.0, 8.0]]) == pytest.approx([19.0])
