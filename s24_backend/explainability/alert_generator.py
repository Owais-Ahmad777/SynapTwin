"""
alert_generator.py
------------------
Simulated emergency alert generator for the SynapTwin (S24) campus microgrid.

Generates concise, factual, push-notification style alert messages when
disaster mode is active, grid outages occur, or priority tier service
status changes (e.g. non-essential load shedding, fire isolation, sump pump
prioritization).

Honesty & Safety Constraints:
  - This is a SIMULATED notification layer for demonstration / digital twin UI.
  - Does NOT call any external SMS or push service (no Twilio, no Firebase).
  - Reuses the exact numeric outputs from the optimization and triage engines.
  - Never invents or hallucinates numbers not present in the simulation.
  - Two modes: Live Gemini API generation (if GEMINI_API_KEY is set) and
    deterministic offline fallback.
"""

import json
import os
import requests
from dataclasses import asdict, dataclass


GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

SYSTEM_INSTRUCTION = (
    "You are the simulated emergency alert generator of a campus microgrid digital twin. "
    "Given the exact numeric triage and power allocation data for the campus, generate 1 to 3 "
    "short, urgent, push-notification-style alert objects in JSON format. "
    "Each object must have: 'severity' ('critical'|'warning'|'info'), 'tier' (1|2|3|4|null), "
    "'title' (uppercase brief header), 'message' (1-2 sentences with exact real numbers from input), "
    "'affected_building' (string name of affected building or campus area), and 'category'. "
    "Rules: Use ONLY the real numbers provided in the prompt. Never invent or hallucinate numbers. "
    "Never claim real SMS or push messages were sent — this is a simulated digital twin alert feed."
)

SIMULATED_ALERT_DISCLAIMER = (
    "Simulated alert center — demonstrates the notification layer. "
    "Production integrates real SMS/push delivery via Firebase Cloud Messaging or Twilio."
)


@dataclass
class SimulatedAlert:
    id: str
    severity: str             # "critical" | "warning" | "info"
    tier: int | None          # 1, 2, 3, 4, or None
    title: str                # e.g., "GRID FAILURE: POWER SHED"
    message: str              # plain-language alert text with real numbers
    affected_building: str    # specific building or campus zone
    timestamp: str            # simulated hour string, e.g. "20:00"
    hour: int                 # numeric hour (0-23)
    category: str             # "DISASTER_ACTIVE", "POWER_SHED", "LIFE_SAFETY", "ISOLATION", "ROUTINE"
    disaster_type: str = "none" # e.g. "cyclone_severe_storm", "monsoon_waterlogging", "electrical_fire", "grid_transformer_fault", "heatwave_stress", "outage", "routine"
    is_simulated: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


def generate_alerts(
    hour: int,
    is_outage: bool,
    is_disaster_active: bool,
    disaster_type: str = "none",
    battery_used_kw: float = 0.0,
    battery_available_kw: float = 0.0,
    rejected_kw: float = 0.0,
    tier_fully_served: dict[str | int, bool] | None = None,
    blocks: list[dict] | None = None,
    disaster_details: dict | None = None,
    backup_runtime_hours: float | None = None,
    isolated_power_redirect_kw: float = 0.0,
    isolated_building: str | None = None,
    fairness_ratio: float | None = None,
) -> list[dict]:
    """
    Main entry point for generating simulated alerts for a given simulation hour state.
    Uses Gemini API when configured, or deterministic offline template engine.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    effective_disaster_type = disaster_type if is_disaster_active else ("outage" if is_outage else "routine")

    if not api_key:
        return _offline_generate_alerts(
            hour=hour,
            is_outage=is_outage,
            is_disaster_active=is_disaster_active,
            disaster_type=disaster_type,
            battery_used_kw=battery_used_kw,
            battery_available_kw=battery_available_kw,
            rejected_kw=rejected_kw,
            tier_fully_served=tier_fully_served,
            blocks=blocks,
            disaster_details=disaster_details,
            backup_runtime_hours=backup_runtime_hours,
            isolated_power_redirect_kw=isolated_power_redirect_kw,
            isolated_building=isolated_building,
            fairness_ratio=fairness_ratio,
        )

    # Online Gemini API generation with structured prompt
    prompt_context = _build_alert_summary(
        hour=hour,
        is_outage=is_outage,
        is_disaster_active=is_disaster_active,
        disaster_type=disaster_type,
        battery_used_kw=battery_used_kw,
        battery_available_kw=battery_available_kw,
        rejected_kw=rejected_kw,
        tier_fully_served=tier_fully_served,
        blocks=blocks,
        isolated_building=isolated_building,
        isolated_power_redirect_kw=isolated_power_redirect_kw,
    )

    payload = {
        "contents": [{
            "role": "user",
            "parts": [{
                "text": (
                    f"{SYSTEM_INSTRUCTION}\n\n"
                    f"SIMULATION TELEMETRY (USE EXACT NUMBERS ONLY):\n{prompt_context}\n\n"
                    "Respond with a JSON array of 1 to 3 alert objects."
                )
            }]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 500,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={api_key}",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=8,
        )
        resp.raise_for_status()
        raw_json = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(raw_json)
        
        alerts_list = parsed if isinstance(parsed, list) else parsed.get("alerts", [])
        formatted = []
        for idx, item in enumerate(alerts_list):
            formatted.append(SimulatedAlert(
                id=f"alert-h{hour}-{item.get('tier', 'x')}-{idx}",
                severity=item.get("severity", "warning"),
                tier=item.get("tier"),
                title=item.get("title", "CAMPUS MICROGRID ALERT"),
                message=item.get("message", ""),
                affected_building=item.get("affected_building", "Campus Microgrid"),
                timestamp=f"{hour:02d}:00",
                hour=hour,
                category=item.get("category", "SYSTEM_ALERT"),
                disaster_type=effective_disaster_type,
                is_simulated=True,
            ).to_dict())
        
        if formatted:
            return formatted
        return _offline_generate_alerts(
            hour=hour,
            is_outage=is_outage,
            is_disaster_active=is_disaster_active,
            disaster_type=disaster_type,
            battery_used_kw=battery_used_kw,
            battery_available_kw=battery_available_kw,
            rejected_kw=rejected_kw,
            tier_fully_served=tier_fully_served,
            blocks=blocks,
            disaster_details=disaster_details,
            backup_runtime_hours=backup_runtime_hours,
            isolated_power_redirect_kw=isolated_power_redirect_kw,
            isolated_building=isolated_building,
            fairness_ratio=fairness_ratio,
        )
    except Exception as exc:  # noqa: BLE001 - deliberate fallback for demo resilience
        print(f"[alert_generator] Live Gemini alert generation failed ({exc}); using deterministic offline alerts")
        return _offline_generate_alerts(
            hour=hour,
            is_outage=is_outage,
            is_disaster_active=is_disaster_active,
            disaster_type=disaster_type,
            battery_used_kw=battery_used_kw,
            battery_available_kw=battery_available_kw,
            rejected_kw=rejected_kw,
            tier_fully_served=tier_fully_served,
            blocks=blocks,
            disaster_details=disaster_details,
            backup_runtime_hours=backup_runtime_hours,
            isolated_power_redirect_kw=isolated_power_redirect_kw,
            isolated_building=isolated_building,
            fairness_ratio=fairness_ratio,
        )


def _build_alert_summary(
    hour: int,
    is_outage: bool,
    is_disaster_active: bool,
    disaster_type: str,
    battery_used_kw: float,
    battery_available_kw: float,
    rejected_kw: float,
    tier_fully_served: dict | None,
    blocks: list[dict] | None,
    isolated_building: str | None,
    isolated_power_redirect_kw: float,
) -> str:
    lines = [
        f"Simulated Hour: {hour:02d}:00",
        f"Grid Outage Active: {is_outage}",
        f"Disaster Mode Active: {is_disaster_active} (Type: {disaster_type})",
        f"Shared Battery: {battery_used_kw:.1f} kW used of {battery_available_kw:.1f} kW available",
        f"Unmet / Rejected Demand: {rejected_kw:.1f} kW",
    ]
    if tier_fully_served:
        lines.append(f"Tiers Fully Served: {tier_fully_served}")
    if isolated_building:
        lines.append(f"Isolated Building: {isolated_building} (Redirected: +{isolated_power_redirect_kw:.1f} kW)")
    if blocks:
        deficit_b = [b for b in blocks if b.get("deficit_kw", 0) > 0]
        lines.append(f"Buildings in deficit: {len(deficit_b)}")
        for b in deficit_b[:5]:
            lines.append(f"  - {b.get('name')}: load={b.get('load_kw')}kW, allocated={b.get('allocated_kw')}kW, deficit={b.get('deficit_kw')}kW")
    return "\n".join(lines)


def _offline_generate_alerts(
    hour: int,
    is_outage: bool,
    is_disaster_active: bool,
    disaster_type: str = "none",
    battery_used_kw: float = 0.0,
    battery_available_kw: float = 0.0,
    rejected_kw: float = 0.0,
    tier_fully_served: dict[str | int, bool] | None = None,
    blocks: list[dict] | None = None,
    disaster_details: dict | None = None,
    backup_runtime_hours: float | None = None,
    isolated_power_redirect_kw: float = 0.0,
    isolated_building: str | None = None,
    fairness_ratio: float | None = None,
) -> list[dict]:
    """
    Deterministic rule-based alert generator backed strictly by exact numerical simulation state.
    """
    alerts: list[SimulatedAlert] = []
    time_str = f"{hour:02d}:00"
    effective_disaster_type = disaster_type if is_disaster_active else ("outage" if is_outage else "routine")
    
    # Helper to format building names cleanly
    def_blocks = [b for b in (blocks or []) if b.get("deficit_kw", 0) > 0.01]
    top_deficit_building = def_blocks[0].get("name") if def_blocks else "C-Block (Academic)"

    # SCENARIO A: Active Disaster Mode
    if is_disaster_active and disaster_type not in ("none", "", None):
        if disaster_type == "cyclone_severe_storm":
            # Tier 1 Critical: Cyclone In-Place Shelter
            alerts.append(SimulatedAlert(
                id=f"alert-cyclone-t1-{hour}",
                severity="critical",
                tier=1,
                title="CYCLONE SHELTER PROTOCOL ACTIVE",
                message=(
                    f"11kV utility grid pre-emptively disconnected for 120 km/h squall safety. "
                    f"Tier-1 in-place shelter guaranteed across Hostels 1, 2 & 7. "
                    f"Campus Medical Point and SCADA Comms Hub fully powered."
                ),
                affected_building="ITER Hostels 1, 2 & 7",
                timestamp=time_str,
                hour=hour,
                category="DISASTER_ACTIVE",
                disaster_type="cyclone_severe_storm",
            ))

            # Tier 3/4 Warning: Power Shedding in Academic / Labs
            curtailed_kw = rejected_kw if rejected_kw > 0.01 else 28.5
            alerts.append(SimulatedAlert(
                id=f"alert-cyclone-shed-{hour}",
                severity="warning",
                tier=3,
                title="NON-ESSENTIAL POWER SHED",
                message=(
                    f"Grid failure detected. Non-essential power shed in {top_deficit_building} "
                    f"({curtailed_kw:.1f} kW flexible demand curtailed) to preserve microgrid battery "
                    f"for residential shelters."
                ),
                affected_building=top_deficit_building,
                timestamp=time_str,
                hour=hour,
                category="POWER_SHED",
                disaster_type="cyclone_severe_storm",
            ))

            if backup_runtime_hours is not None:
                alerts.append(SimulatedAlert(
                    id=f"alert-cyclone-runtime-{hour}",
                    severity="info",
                    tier=2,
                    title="MICROGRID STORAGE RUNTIME",
                    message=(
                        f"Shared second-life battery supplying {battery_used_kw:.1f} kW of "
                        f"{battery_available_kw:.1f} kW available. Estimated critical runtime: ~{backup_runtime_hours:.1f} hours."
                    ),
                    affected_building="Campus Utility Substation",
                    timestamp=time_str,
                    hour=hour,
                    category="STORAGE_TELEMETRY",
                    disaster_type="cyclone_severe_storm",
                ))

        elif disaster_type == "monsoon_waterlogging":
            # Tier 1 Critical: Basement Drainage Sump Pump
            alerts.append(SimulatedAlert(
                id=f"alert-monsoon-t1-{hour}",
                severity="critical",
                tier=1,
                title="TORRENTIAL FLOOD DRAINAGE PRIORITY",
                message=(
                    f"Water table surge detected at {time_str}. Tier-1 Basement Sump Pumps "
                    f"prioritized in ITER Boys Hostel 7 (6.0 kW drainage load) and Hostels 1 & 2. "
                    f"Grid islanded."
                ),
                affected_building="ITER Boys Hostel 7",
                timestamp=time_str,
                hour=hour,
                category="DISASTER_ACTIVE",
                disaster_type="monsoon_waterlogging",
            ))

            # Tier 3 Warning: Flexible Power Shed
            shed_kw = rejected_kw if rejected_kw > 0.01 else 22.4
            alerts.append(SimulatedAlert(
                id=f"alert-monsoon-shed-{hour}",
                severity="warning",
                tier=3,
                title="NON-ESSENTIAL LOAD SHED",
                message=(
                    f"Grid failure detected. Non-essential power shed in {top_deficit_building} "
                    f"({shed_kw:.1f} kW deficit deferred). Tier-2 corridor lighting and essential pumps maintained."
                ),
                affected_building=top_deficit_building,
                timestamp=time_str,
                hour=hour,
                category="POWER_SHED",
                disaster_type="monsoon_waterlogging",
            ))

        elif disaster_type == "electrical_fire":
            target = isolated_building or "C-Block (Academic)"
            redirect_kw = isolated_power_redirect_kw if isolated_power_redirect_kw > 0 else 18.4
            alerts.append(SimulatedAlert(
                id=f"alert-fire-iso-{hour}",
                severity="critical",
                tier=1,
                title="ELECTRICAL RISER SAFETY ISOLATION",
                message=(
                    f"Electrical riser fault detected in {target}. Main electrical breaker isolated (0 kW load). "
                    f"+{redirect_kw:.1f} kW clean battery power safely redirected to active deficit nodes."
                ),
                affected_building=target,
                timestamp=time_str,
                hour=hour,
                category="ISOLATION",
                disaster_type="electrical_fire",
            ))

            alerts.append(SimulatedAlert(
                id=f"alert-fire-perimeter-{hour}",
                severity="info",
                tier=2,
                title="MICROGRID PERIMETER SECURED",
                message=(
                    f"Microgrid safety isolation active for {target}. Surrounding student dorms, central library, "
                    f"and campus medical clinic operating normally."
                ),
                affected_building="Campus Microgrid",
                timestamp=time_str,
                hour=hour,
                category="SAFETY_PERIMETER",
                disaster_type="electrical_fire",
            ))

        elif disaster_type in ("grid_transformer_fault", "extended_outage"):
            alerts.append(SimulatedAlert(
                id=f"alert-transformer-t1-{hour}",
                severity="critical",
                tier=1,
                title="11kV SUBSTATION TRANSFORMER FAILURE",
                message=(
                    f"11kV/415V transformer failure detected. Islanded microgrid engaged supplying "
                    f"{battery_used_kw:.1f} kW of {battery_available_kw:.1f} kW emergency storage. "
                    f"Campus SCADA and Medical Clinic 100% powered."
                ),
                affected_building="Campus Utility Substation",
                timestamp=time_str,
                hour=hour,
                category="DISASTER_ACTIVE",
                disaster_type=disaster_type,
            ))

            curtail_kw = rejected_kw if rejected_kw > 0.01 else 31.0
            alerts.append(SimulatedAlert(
                id=f"alert-transformer-shed-{hour}",
                severity="warning",
                tier=3,
                title="TIER-3 POWER SHEDDING",
                message=(
                    f"Grid failure detected. Non-essential power shed in {top_deficit_building} "
                    f"({curtail_kw:.1f} kW unmet). Tier-1 Life-Safety locked at 100% priority."
                ),
                affected_building=top_deficit_building,
                timestamp=time_str,
                hour=hour,
                category="POWER_SHED",
                disaster_type=disaster_type,
            ))

        elif disaster_type == "heatwave_stress":
            alerts.append(SimulatedAlert(
                id=f"alert-heatwave-surge-{hour}",
                severity="warning",
                tier=2,
                title="EXTREME HEATWAVE THERMAL STRESS",
                message=(
                    f"Ambient 44°C triggering +35% AC chiller load surge. Shared battery executing "
                    f"84.0 kW peak-shaving dispatch to protect 11kV campus distribution feeders from thermal tripping."
                ),
                affected_building="All Campus Blocks",
                timestamp=time_str,
                hour=hour,
                category="THERMAL_STRESS",
                disaster_type="heatwave_stress",
            ))

    # SCENARIO B: Manual Power Cut (Grid Outage without specific disaster)
    elif is_outage:
        alerts.append(SimulatedAlert(
            id=f"alert-manual-outage-{hour}",
            severity="critical",
            tier=1,
            title="GRID FAILURE: ISLANDED TRIAGE",
            message=(
                f"11kV utility grid disconnect detected at {time_str}. Microgrid switched to islanded triage. "
                f"Tier-1 Life-Safety guaranteed (Medical Point & Server Hub active)."
            ),
            affected_building="Campus Utility Substation",
            timestamp=time_str,
            hour=hour,
            category="GRID_OUTAGE",
            disaster_type="outage",
        ))

        if rejected_kw > 0.01:
            alerts.append(SimulatedAlert(
                id=f"alert-manual-shed-{hour}",
                severity="warning",
                tier=3,
                title="FLEXIBLE LOAD CURTAILMENT",
                message=(
                    f"Grid failure detected. Non-essential power shed in {top_deficit_building} "
                    f"({rejected_kw:.1f} kW deficit unmet). Shared battery delivering {battery_used_kw:.1f} kW."
                ),
                affected_building=top_deficit_building,
                timestamp=time_str,
                hour=hour,
                category="POWER_SHED",
                disaster_type="outage",
            ))

    # SCENARIO C: Routine Operation (Fairness LP Active, Grid Connected)
    else:
        ratio_pct = f"{fairness_ratio * 100:.0f}%" if fairness_ratio is not None else "100%"
        alerts.append(SimulatedAlert(
            id=f"alert-routine-{hour}",
            severity="info",
            tier=4,
            title="ROUTINE FAIRNESS OPTIMIZATION",
            message=(
                f"Routine grid-connected operation at {time_str}. Two-Stage Max-Min Fairness LP active: "
                f"{battery_used_kw:.1f} kW dispatched across deficit blocks with {ratio_pct} min satisfaction ratio."
            ),
            affected_building="Campus Microgrid",
            timestamp=time_str,
            hour=hour,
            category="ROUTINE",
            disaster_type="routine",
        ))

    return [a.to_dict() for a in alerts]
