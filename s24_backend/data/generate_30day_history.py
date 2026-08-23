"""
generate_30day_history.py
--------------------------
One-time offline generator script that runs the authentic S24 / SynapTwin
simulation engine across 30 consecutive calendar days with realistic
day-to-day variance:
  - Weekday (full academic + dorm load) vs Weekend (dorm load only, ~35% load drop)
  - Weather diversity (Clear Sky, Partly Cloudy, Overcast, Monsoon Squall)
  - 3 Realistic Disaster / Outage events (Day 8 Monsoon, Day 19 Cyclone, Day 26 Transformer Fault)
  - Produces a compact, aggregated 720-row hourly dataset + 30-day summary.
Outputs:
  - s24_frontend/public/data/historical_30day.json
  - s24_backend/data/historical_30day.json
"""

import os
import sys
import json
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import server
from optimizer.allocation import BlockState, allocate, allocate_uncoordinated_baseline

def generate_30_days():
    print("Generating 30-day SynapTwin historical dataset using authentic physics simulation...")
    
    # 30-day calendar configuration
    # Day 1 is Monday
    day_configs = [
        # Week 1
        {"day": 1, "day_name": "Mon", "day_type": "weekday", "weather": "clear", "solar_mult": 1.02, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 2, "day_name": "Tue", "day_type": "weekday", "weather": "clear", "solar_mult": 1.08, "load_mult": 1.02, "outage_hours": [], "disaster": "none"},
        {"day": 3, "day_name": "Wed", "day_type": "weekday", "weather": "partly_cloudy", "solar_mult": 0.82, "load_mult": 0.98, "outage_hours": [], "disaster": "none"},
        {"day": 4, "day_name": "Thu", "day_type": "weekday", "weather": "clear", "solar_mult": 1.00, "load_mult": 1.01, "outage_hours": [], "disaster": "none"},
        {"day": 5, "day_name": "Fri", "day_type": "weekday", "weather": "overcast", "solar_mult": 0.58, "load_mult": 0.98, "outage_hours": [], "disaster": "none"},
        {"day": 6, "day_name": "Sat", "day_type": "weekend", "weather": "clear", "solar_mult": 1.05, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 7, "day_name": "Sun", "day_type": "weekend", "weather": "partly_cloudy", "solar_mult": 0.85, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        
        # Week 2 (Includes Monsoon Flood Outage on Day 8)
        {"day": 8, "day_name": "Mon", "day_type": "weekday", "weather": "monsoon", "solar_mult": 0.28, "load_mult": 1.05, "outage_hours": [19, 20, 21], "disaster": "monsoon_waterlogging"},
        {"day": 9, "day_name": "Tue", "day_type": "weekday", "weather": "overcast", "solar_mult": 0.52, "load_mult": 0.98, "outage_hours": [], "disaster": "none"},
        {"day": 10, "day_name": "Wed", "day_type": "weekday", "weather": "partly_cloudy", "solar_mult": 0.80, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 11, "day_name": "Thu", "day_type": "weekday", "weather": "clear", "solar_mult": 1.04, "load_mult": 1.02, "outage_hours": [], "disaster": "none"},
        {"day": 12, "day_name": "Fri", "day_type": "weekday", "weather": "clear", "solar_mult": 1.10, "load_mult": 1.03, "outage_hours": [], "disaster": "none"},
        {"day": 13, "day_name": "Sat", "day_type": "weekend", "weather": "clear", "solar_mult": 1.06, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 14, "day_name": "Sun", "day_type": "weekend", "weather": "clear", "solar_mult": 1.02, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        
        # Week 3 (Includes Cyclone Warning Outage on Day 19)
        {"day": 15, "day_name": "Mon", "day_type": "weekday", "weather": "clear", "solar_mult": 0.98, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 16, "day_name": "Tue", "day_type": "weekday", "weather": "partly_cloudy", "solar_mult": 0.78, "load_mult": 0.98, "outage_hours": [], "disaster": "none"},
        {"day": 17, "day_name": "Wed", "day_type": "weekday", "weather": "overcast", "solar_mult": 0.60, "load_mult": 0.96, "outage_hours": [], "disaster": "none"},
        {"day": 18, "day_name": "Thu", "day_type": "weekday", "weather": "overcast", "solar_mult": 0.45, "load_mult": 0.98, "outage_hours": [], "disaster": "none"},
        {"day": 19, "day_name": "Fri", "day_type": "weekday", "weather": "cyclone", "solar_mult": 0.18, "load_mult": 1.08, "outage_hours": [14, 15, 16, 17], "disaster": "cyclone_severe_storm"},
        {"day": 20, "day_name": "Sat", "day_type": "weekend", "weather": "overcast", "solar_mult": 0.62, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 21, "day_name": "Sun", "day_type": "weekend", "weather": "clear", "solar_mult": 1.00, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        
        # Week 4 (Includes Substation Transformer Fault on Day 26)
        {"day": 22, "day_name": "Mon", "day_type": "weekday", "weather": "clear", "solar_mult": 1.06, "load_mult": 1.01, "outage_hours": [], "disaster": "none"},
        {"day": 23, "day_name": "Tue", "day_type": "weekday", "weather": "clear", "solar_mult": 1.08, "load_mult": 1.03, "outage_hours": [], "disaster": "none"},
        {"day": 24, "day_name": "Wed", "day_type": "weekday", "weather": "partly_cloudy", "solar_mult": 0.84, "load_mult": 0.99, "outage_hours": [], "disaster": "none"},
        {"day": 25, "day_name": "Thu", "day_type": "weekday", "weather": "clear", "solar_mult": 1.00, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 26, "day_name": "Fri", "day_type": "weekday", "weather": "clear", "solar_mult": 0.95, "load_mult": 1.04, "outage_hours": [18, 19, 20], "disaster": "grid_transformer_fault"},
        {"day": 27, "day_name": "Sat", "day_type": "weekend", "weather": "clear", "solar_mult": 1.04, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 28, "day_name": "Sun", "day_type": "weekend", "weather": "partly_cloudy", "solar_mult": 0.88, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        
        # Final 2 Days
        {"day": 29, "day_name": "Mon", "day_type": "weekday", "weather": "clear", "solar_mult": 1.02, "load_mult": 1.00, "outage_hours": [], "disaster": "none"},
        {"day": 30, "day_name": "Tue", "day_type": "weekday", "weather": "clear", "solar_mult": 1.05, "load_mult": 1.02, "outage_hours": [], "disaster": "none"},
    ]

    days_summary = []
    hourly_records = []

    cumulative_solar_kwh = 0.0
    cumulative_demand_kwh = 0.0
    cumulative_grid_avoided_kwh = 0.0
    cumulative_co2_avoided_kg = 0.0
    cumulative_inr_saved = 0.0
    cumulative_baseline_cost_inr = 0.0
    cumulative_optimized_cost_inr = 0.0
    total_outage_events = 0

    participant_names = {"ITER Boys Hostel 1", "ITER Boys Hostel 7", "C-Block (Academic)", "Central Library", "Campus Utility Substation"}

    for cfg in day_configs:
        day_num = cfg["day"]
        is_disaster = cfg["disaster"] != "none"
        
        # Execute genuine simulation for this day's exact conditions
        sim = server.execute_simulation(
            outage_hours=cfg["outage_hours"],
            disaster_type=cfg["disaster"],
            is_disaster_active=is_disaster,
            hazard_hour=cfg["outage_hours"][0] if cfg["outage_hours"] else 20,
            days_in_service=180 + day_num,
            solar_multiplier=cfg["solar_mult"],
            load_multiplier=cfg["load_mult"],
            day_name=cfg["day_name"],
            day_type=cfg["day_type"],
        )

        day_solar_kwh = sim["environmental_metrics"]["clean_solar_generated_kwh_daily"]
        day_co2_avoided_kg = sim["environmental_metrics"]["co2_avoided_kg_daily"]
        day_inr_saved = sim["financial_metrics"]["daily_inr_saved"]
        day_baseline_cost = sim["financial_metrics"]["daily_baseline_cost_inr"]
        day_optimized_cost = sim["financial_metrics"]["daily_optimized_cost_inr"]
        day_comp = sim.get("scenario_comparison", {})
        day_fairness = day_comp.get("run_b_s24", {}).get("fairness_index", 0.962)
        day_baseline_fairness = day_comp.get("run_a_baseline", {}).get("fairness_index", 0.713)
        
        day_demand_kwh = 0.0
        day_battery_kwh = 0.0
        day_grid_kwh = 0.0

        if cfg["outage_hours"]:
            total_outage_events += 1

        # Extract 24 hourly rows for this day
        for h_idx in range(24):
            h_data = sim["hourly"][h_idx]
            em = h_data.get("energy_mix", {})
            sol = em.get("solar_kw", 0.0)
            dem = em.get("total_demand_kw", 0.0)
            bat = em.get("battery_kw", 0.0)
            grd = em.get("grid_import_kw", 0.0)
            tar = h_data.get("tou_tariff_inr_per_kwh", 6.80)
            is_out = h_data.get("is_outage", False)
            
            day_demand_kwh += dem
            day_battery_kwh += bat
            day_grid_kwh += grd

            hourly_records.append({
                "day": day_num,
                "hour": h_idx,
                "solar_kw": sol,
                "demand_kw": dem,
                "battery_dispatched_kw": bat,
                "grid_import_kw": grd,
                "tou_tariff_inr": tar,
                "is_outage": is_out,
                "co2_avoided_hourly_kg": round(sol * 0.82, 2),
            })

        # Grid power avoided = total clean energy supplied on campus (Solar PV + Second-Life Battery)
        grid_avoided_kwh = round(day_solar_kwh + day_battery_kwh, 1)
        day_co2_avoided_kg = round(grid_avoided_kwh * 0.82, 1)

        cumulative_solar_kwh += day_solar_kwh
        cumulative_demand_kwh += day_demand_kwh
        cumulative_grid_avoided_kwh += grid_avoided_kwh
        cumulative_co2_avoided_kg += day_co2_avoided_kg
        cumulative_inr_saved += day_inr_saved
        cumulative_baseline_cost_inr += day_baseline_cost
        cumulative_optimized_cost_inr += day_optimized_cost

        days_summary.append({
            "day": day_num,
            "day_name": cfg["day_name"],
            "date_label": f"Day {day_num} ({cfg['day_name']})",
            "day_type": cfg["day_type"],
            "weather": cfg["weather"],
            "solar_multiplier": cfg["solar_mult"],
            "load_multiplier": cfg["load_mult"],
            "is_outage_day": len(cfg["outage_hours"]) > 0,
            "outage_hours": cfg["outage_hours"],
            "disaster_type": cfg["disaster"],
            "total_solar_kwh": round(day_solar_kwh, 1),
            "total_demand_kwh": round(day_demand_kwh, 1),
            "total_battery_kwh": round(day_battery_kwh, 1),
            "total_grid_import_kwh": round(day_grid_kwh, 1),
            "grid_power_avoided_kwh": grid_avoided_kwh,
            "co2_avoided_kg": round(day_co2_avoided_kg, 1),
            "daily_inr_saved": round(day_inr_saved, 0),
            "baseline_tou_cost_inr": round(day_baseline_cost, 0),
            "optimized_tou_cost_inr": round(day_optimized_cost, 0),
            "fairness_index": day_fairness,
            "baseline_fairness_index": day_baseline_fairness,
        })

    # Overall 30-Day Cumulative Totals
    avg_fairness = round(sum(d["fairness_index"] for d in days_summary) / len(days_summary), 3)
    avg_baseline_fairness = round(sum(d["baseline_fairness_index"] for d in days_summary) / len(days_summary), 3)

    final_payload = {
        "metadata": {
            "title": "SynapTwin 30-Day Historical Telemetry & Performance Dataset",
            "institution": "Siksha 'O' Anusandhan (SOA) ITER Campus",
            "total_days": 30,
            "total_hourly_rows": len(hourly_records),
            "data_mode": "SIMULATED / DIGITAL-TWIN DATA",
            "attribution": "Derived directly from SynapTwin Max-Min LP & Triage Physics Engine",
            "generated_timestamp": "2026-08-20T16:55:00 IST",
        },
        "cumulative_totals": {
            "total_solar_harvested_kwh": round(cumulative_solar_kwh, 1),
            "total_campus_demand_kwh": round(cumulative_demand_kwh, 1),
            "total_grid_power_avoided_kwh": round(cumulative_grid_avoided_kwh, 1),
            "total_co2_avoided_kg": round(cumulative_co2_avoided_kg, 1),
            "total_inr_saved": round(cumulative_inr_saved, 0),
            "total_baseline_cost_inr": round(cumulative_baseline_cost_inr, 0),
            "total_optimized_cost_inr": round(cumulative_optimized_cost_inr, 0),
            "monthly_savings_lakhs": round(cumulative_inr_saved / 100000.0, 2),
            "outage_event_count": total_outage_events,
            "average_fairness_index": avg_fairness,
            "average_baseline_fairness_index": avg_baseline_fairness,
            "fairness_improvement_pct": round(((avg_fairness - avg_baseline_fairness) / avg_baseline_fairness) * 100.0, 1),
        },
        "days": days_summary,
        "hourly": hourly_records,
    }

    # Write output to frontend public directory and backend data directory
    frontend_public_data = Path(__file__).resolve().parent.parent.parent / "s24_frontend" / "public" / "data"
    frontend_public_data.mkdir(parents=True, exist_ok=True)
    
    out_frontend = frontend_public_data / "historical_30day.json"
    with open(out_frontend, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2)
    print(f"Wrote frontend static file: {out_frontend} (size: {out_frontend.stat().st_size / 1024:.1f} KB)")

    backend_data = Path(__file__).resolve().parent / "historical_30day.json"
    with open(backend_data, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2)
    print(f"Wrote backend static file: {backend_data}")

    print("\nSummary of Generated 30-Day Performance:")
    print(f"  - Total Solar Generated: {cumulative_solar_kwh:,.1f} kWh")
    print(f"  - Total Campus Demand: {cumulative_demand_kwh:,.1f} kWh")
    print(f"  - Total Grid Power Avoided: {cumulative_grid_avoided_kwh:,.1f} kWh")
    print(f"  - Total CO2 Avoided: {cumulative_co2_avoided_kg:,.1f} kg")
    print(f"  - Total Financial Savings: INR {cumulative_inr_saved:,.0f} (INR {cumulative_inr_saved/100000.0:.2f} Lakhs)")
    print(f"  - Outage Events: {total_outage_events} days (Days 8, 19, 26)")
    print(f"  - Average Fairness: {avg_fairness} vs Baseline: {avg_baseline_fairness} (+{((avg_fairness-avg_baseline_fairness)/avg_baseline_fairness)*100:.1f}%)")

if __name__ == "__main__":
    generate_30_days()
