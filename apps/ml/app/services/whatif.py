"""What-if scenario simulation.

Applies additive or multiplicative deltas to a baseline series, with optional
floor/ceiling clamping, and reports the aggregate lift. Pure arithmetic — no
external deps.
"""

from __future__ import annotations

from typing import Any


def _apply(baseline: list[float], scenario: dict[str, Any]) -> list[float]:
    mechanic = scenario.get("mechanic", "additive")
    floor = scenario.get("floor")
    ceiling = scenario.get("ceiling")
    out: list[float] = []
    for v in baseline:
        if mechanic == "multiplicative":
            nv = v * (1 + scenario.get("deltaPct", 0) / 100.0)
        else:  # additive
            nv = v + scenario.get("deltaAbsolute", 0)
        if floor is not None:
            nv = max(floor, nv)
        if ceiling is not None:
            nv = min(ceiling, nv)
        out.append(nv)
    return out


def simulate(baseline: list[float], scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    base_sum = sum(baseline)
    results = []
    for scenario in scenarios:
        values = _apply(baseline, scenario)
        lift = sum(values) - base_sum
        lift_pct = (lift / base_sum * 100.0) if base_sum != 0 else 0.0
        results.append({"values": values, "aggregateLift": lift, "aggregateLiftPct": lift_pct})
    return {"baseline": baseline, "scenarios": results}
