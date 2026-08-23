"""
gemini_explain.py
------------------
Turns an AllocationResult (raw optimizer output) into a plain-language
explanation a hostel warden or student — not an optimization engineer — can
read and trust. This is the layer that makes the digital twin *explainable*
rather than a black box.

Two modes:
  - Live: calls the Gemini API with the allocation numbers and a fixed
    system prompt, asking for a short, factual explanation.
  - Offline fallback: a deterministic rule-based explainer that reads
    directly off the AllocationResult fields. Used automatically if no
    GEMINI_API_KEY is set or the API call fails, so a demo never stalls on
    a flaky connection or quota limit — and so every explanation is at
    minimum backed by the actual numbers, never hallucinated.

Set the key via environment variable: export GEMINI_API_KEY="..."
"""

import os

import requests

GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

SYSTEM_INSTRUCTION = (
    "You are the explainability layer of a campus shared-battery energy system. "
    "You are given the exact numeric output of a fairness optimizer for one hour. "
    "Write a short (3-5 sentence), plain-language explanation for a hostel warden "
    "(not an engineer) of what happened and why it is fair. State the actual kW "
    "numbers you were given. Do not invent numbers not present in the input. "
    "If the allocation was infeasible or something was rejected, say so plainly "
    "and explain what a warden could do about it (e.g. reduce non-critical load, "
    "request grid backup)."
)


def explain(result, blocks, hour: int | None = None) -> str:
    """
    result: AllocationResult from optimizer.allocation.allocate
    blocks: the list[BlockState] passed into allocate (for load/solar context)
    hour: optional hour-of-day (0-23) for context in the explanation
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _offline_explain(result, blocks, hour)

    payload_summary = _build_summary(result, blocks, hour)

    try:
        resp = requests.post(
            GEMINI_URL,
            params={"key": api_key},
            json={
                "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
                "contents": [{"parts": [{"text": payload_summary}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 300},
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:  # noqa: BLE001 - deliberate fallback for demo resilience
        print(f"[gemini_explain] Live Gemini call failed ({exc}); using offline explainer")
        return _offline_explain(result, blocks, hour)


def _build_summary(result, blocks, hour) -> str:
    lines = [f"Hour: {hour if hour is not None else 'N/A'}",
             f"Battery available: {result.battery_available_kw} kW",
             f"Battery used: {result.battery_used_kw} kW",
             f"Infeasible: {result.infeasible}"]
    if result.infeasible_reason:
        lines.append(f"Reason: {result.infeasible_reason}")
    if result.fairness_ratio is not None:
        lines.append(f"Fairness ratio achieved (min satisfaction across blocks): {result.fairness_ratio}")
    lines.append(f"Rejected/unmet demand: {result.rejected_kw} kW")
    for b in blocks:
        lines.append(
            f"- {b.name}: load={b.load_kw}kW, solar={b.solar_kw}kW, "
            f"deficit={b.deficit_kw:.1f}kW, critical_need={b.critical_kw}kW, "
            f"critical_given={result.critical_allocation.get(b.name, 0)}kW, "
            f"flexible_given={result.flexible_allocation.get(b.name, 0)}kW"
        )
    return "\n".join(lines)


def _offline_explain(result, blocks, hour) -> str:
    hour_str = f"At hour {hour:02d}:00, " if hour is not None else "For this hour, "
    parts = [f"{hour_str}the shared battery had {result.battery_available_kw:.1f} kW available "
             f"and used {result.battery_used_kw:.1f} kW of it."]

    if result.infeasible:
        parts.append(
            f"This was not enough to cover even the guaranteed critical loads across all blocks, "
            f"so critical power was split proportionally between blocks instead of fully covered, "
            f"and all non-critical (flexible) demand was rejected this hour "
            f"({result.rejected_kw:.1f} kW unmet). Wardens should reduce non-essential load or "
            f"expect grid backup to cover the shortfall."
        )
    else:
        served = [b for b in blocks if result.flexible_allocation.get(b.name, 0) > 0.01]
        if result.fairness_ratio is not None and result.fairness_ratio < 0.999:
            parts.append(
                f"After guaranteeing each block's critical/essential load, the remaining battery power "
                f"was split so that every block received at least {result.fairness_ratio * 100:.0f}% of "
                f"its remaining (non-critical) demand — this is max-min fairness: no block could be given "
                f"more without taking power away from a block that was worse off."
            )
        elif served:
            parts.append(
                "There was enough battery power to fully cover every block's remaining demand this hour, "
                "so no rationing was needed."
            )
        for b in blocks:
            total = result.total_allocation.get(b.name, 0)
            parts.append(f"{b.name} received {total:.1f} kW total "
                         f"(load {b.load_kw:.1f} kW, own solar {b.solar_kw:.1f} kW).")
        if result.rejected_kw > 0.01:
            parts.append(f"{result.rejected_kw:.1f} kW of flexible demand could not be met this hour.")

    return " ".join(parts)


if __name__ == "__main__":
    from optimizer.allocation import BlockState, allocate  # noqa: E402

    demo_blocks = [
        BlockState(name="Hostel A", load_kw=60, solar_kw=10, critical_kw=8, feeder_limit_kw=50),
        BlockState(name="Hostel B", load_kw=55, solar_kw=0, critical_kw=8, feeder_limit_kw=50),
        BlockState(name="Academic", load_kw=90, solar_kw=15, critical_kw=15, feeder_limit_kw=60),
    ]
    res = allocate(demo_blocks, battery_available_kw=25)
    print(explain(res, demo_blocks, hour=20))
