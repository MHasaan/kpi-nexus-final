"""Shared request constraints for the ML routers (BE-024).

The API already bounds what it forwards, but the sidecar is reachable from
inside the network, so it validates its own inputs: a 1e6 horizon cost 18 s of
CPU, empty series forecast zeros, and unknown methods were silently ignored.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

# Generous: ~270 years of daily points. Bounds memory/CPU per request.
MAX_POINTS = 100_000

Series = Annotated[list[float], Field(min_length=1, max_length=MAX_POINTS)]
Timestamps = Annotated[list[str], Field(max_length=MAX_POINTS)]
# Free-form names fall back to a default model in the services; just bound them.
ModelName = Annotated[str, Field(min_length=1, max_length=40)]
