# S24 — Community Energy Flexibility & Shared-Battery Digital Twin — Backend

SOA Ideathon 2026 — SOA ITER campus pilot: 3 blocks (Hostel A, Hostel B, Academic)
sharing rooftop solar + a second-life shared battery.

## Feature map

| Feature (as pitched) | Module | What it does |
|---|---|---|
| Solar generation prediction | `data/solar_forecast.py` | Linear regression (hour-of-day + trailing trend features) forecasts next-day irradiance; reports validation MAE |
| Battery health tracker + repurposing | `optimizer/battery_health.py` | Tracks State of Health from cycling + calendar aging; battery automatically moves through duty tiers (FULL_DUTY → BACKUP_ONLY → SECOND_LIFE_LOW → RETIRE), derating available power as it ages |
| EV charging by demand + redirection | `optimizer/ev_fleet.py` | EVs are a flexible Tier-4 load that opportunistically soaks up solar surplus; opted-in EVs contribute power back (V2G) during outages |
| Disaster-time triage ("where must we use backup energy") | `optimizer/disaster_triage.py` | Strict lexicographic tier priority (life-safety → essential → academic → convenience) with a live hazard-report mechanism that reprioritizes within a tier |
| Backup energy during power cuts | `run_simulation.py` (OUTAGE_HOURS) | Outage window where disaster-triage mode takes over from routine fairness |
| Opaque/secure allocation | `security/privacy.py` | Real AES (Fernet) encryption of raw hourly records at rest; role-based views so one block never sees another's raw numbers |
| (original) fairness engine | `optimizer/allocation.py` | Max-min fairness for routine (non-outage) hours — PuLP LP with a dependency-free water-filling fallback |
| (original) load + solar data | `data/nasa_power.py`, `data/synthetic_load.py` | NASA POWER irradiance (offline clear-sky fallback) + per-block synthetic load curves |
| **Real campus geometry** | `data/campus_geo.py`, `data/campus_data/osm_buildings.json` | Parses actual SOA ITER building footprints (from OpenStreetMap) to compute real roof area and floor area — solar capacity and load estimates are grounded in the real campus, not placeholders |
| (original) explainability | `explainability/gemini_explain.py` | Turns allocation numbers into plain-language explanations via Gemini, with an offline rule-based fallback |

## Two allocation ethics, deliberately different

## Real campus geometry (new)

The 3 pilot participants are no longer placeholders — they're built from
**actual SOA ITER building footprints** pulled from OpenStreetMap
(`data/campus_data/osm_buildings.json`, © OpenStreetMap contributors, ODbL):

| Block | Real building | Levels | Footprint | Peak load (est.) | Solar (est.) |
|---|---|---|---|---|---|
| Hostel A | ITER Boys Hostel 1 | 1 | 1,350 m² | 24.3 kW | 121.5 kWp |
| Hostel B | ITER Boys Hostel 7 | 6 | 1,487 m² | 160.6 kW | 133.8 kWp |
| Academic | C-block (Academic Block) | 3 | 2,723 m² | 245.1 kW | 245.1 kWp |

Notice the asymmetry this produces, entirely from real geometry: **Hostel 1
is a net solar exporter** (huge single-story roof, few residents) while
**Hostel 7 is a heavy net importer** (same-size roof, 6x the floor area of
residents). At midday, the simulation shows both hostels fully self-sufficient
from their own solar while the shared battery covers C-block's remaining
deficit at a fairness ratio of 1.0 — a genuinely real "community energy
flexibility" story, not a scripted one.

`data/campus_data/campus_buildings.geojson` has all 16 real campus buildings
(not just the 3 pilot ones) ready to drop into a Leaflet/Mapbox map for the
dashboard.

**Assumptions used to go from footprint → kW (documented, defensible in Q&A):**
- Rooftop solar: 60% of roof usable, 150 Wp/m² installed panel density
- Hostel peak load density: 18 W/m² of gross floor area
- Academic/institutional peak load density: 30 W/m²
- Critical/essential load: 12% of peak

These are reasonable planning-stage assumptions, not measured data — say so
explicitly if asked, and note real deployment would calibrate against actual
sanctioned load / transformer capacity from the campus electrical office.


- **Routine mode (`allocation.py`)**: max-min fairness. No block can be
  favored over another for everyday convenience load.
- **Disaster mode (`disaster_triage.py`)**: strict tier priority + live need
  reports. Fairness is the wrong ethic in an emergency — a flooded block's
  water pump must outrank another block's ordinary evening lighting, even
  completely. This contrast is worth stating explicitly in your pitch.

## Setup

```bash
pip install -r requirements.txt
python3 run_simulation.py
```

Writes `hourly_results.json` — includes:
- `battery_health`: today's SoH, duty tier, and derated available power
- `solar_forecast`: next-day prediction + validation MAE
- `impact_metrics`: grid electricity avoided (kWh) and CO2 avoided (kg) —
  using the commonly-cited India CEA baseline grid emission factor (~0.82
  kgCO2/kWh; cite/update with the latest CEA figure for your report)
- `privacy_demo`: a sample of what one block's dashboard is allowed to see
- `hourly`: 24 records, each either `FAIRNESS` mode or `DISASTER_TRIAGE`
  mode (during the 19:00-21:00 outage window), including a flooding hazard
  report at Hostel B during hour 20 that demonstrably reprioritizes
  allocation within its tier

## Optional: live Gemini explanations

```bash
export GEMINI_API_KEY="your-key"
python3 run_simulation.py
```

## Design notes worth putting in your pitch/report

- **Battery repurposing is automatic, not manual**: the system doesn't need
  a human to decide when the battery is "too old for daily use" — SoH
  crossing 80% automatically shifts it to backup-only duty, preserving
  remaining life for when it matters (a real second-life-battery economics
  argument, not just a slogan).
- **Solar forecasting is intentionally simple and explainable** (linear
  regression on hour-of-day + trend), not a black-box deep model — a
  campus operator can sanity-check *why* it predicts what it predicts, and
  it retrains fast on a handful of days of local data.
- **EV charging is genuinely two-way**: normal-time charging is
  opportunistic (soaks up otherwise-wasted midday solar surplus) and
  outage-time V2G is strictly opt-in per vehicle owner with a protected
  minimum reserve SoC — nobody's personal vehicle gets drained without
  consent.
- **Privacy is real encryption, not a placeholder**: `security/privacy.py`
  uses Fernet (AES-128-CBC + HMAC authentication) via the standard
  `cryptography` library, plus role-based redaction so blocks can verify
  the fairness *process* (their own numbers, the achieved fairness ratio)
  without seeing other blocks' raw consumption data.

## Known drawbacks — and how to answer them if judges ask

| Drawback | How to handle it |
|---|---|
| Synthetic load/solar data, not real campus meters | Frame as calibrated against typical hostel/academic benchmarks; propose smart-meter rollout as phase 2 |
| NASA POWER ~3-day latency, 1km resolution | Fine for planning/forecasting; pair with a local pyranometer or live weather API for real-time control |
| Degradation model is a standard citable approximation, not manufacturer cell data | Note this explicitly; real deployment would calibrate against the actual battery vendor's datasheet |
| Solar forecast trained on synthetic weather variability here | Swap in real multi-day NASA POWER history once you have network access — no code changes needed, `generate_synthetic_history()` is a drop-in stand-in |
| V2G draws down someone's personal vehicle | Strictly opt-in with a protected reserve SoC floor — already designed in, worth stating explicitly |
| Who legally owns/bills the shared battery across 3 blocks? | Real regulatory gap in India (group captive / virtual net metering) — name it, propose a simple cost-allocation formula proportional to energy received |
| Single shared battery = single point of failure | On battery fault, system should revert to pure grid-served mode and flag it rather than fail silently — good answer if asked about robustness |
| Encryption key management | This demo generates a key in-process; production would use a proper secrets manager/HSM — worth a one-line mention, not a live concern for a hackathon demo |
| Fire/safety risk of second-life EV batteries | Real concern — mention BMS + thermal monitoring as a required physical safety layer |

## Next steps

- React + recharts dashboard consuming `hourly_results.json`: a "play a
  day" slider, a live outage-trigger button, a battery-health/lifetime
  chart, and per-block login showing only that block's `block_view`.
- Once you have network access, wire `nasa_power.py` to pull several real
  days of history and feed it directly into `solar_forecast.py`.
