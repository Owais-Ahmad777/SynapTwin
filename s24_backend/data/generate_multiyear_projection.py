"""
generate_multiyear_projection.py
--------------------------------
Multi-year synthetic projection module for SynapTwin campus microgrid.

Honesty & Provenance Statement:
  Real multi-year interval data for the SOA ITER campus is not publicly available.
  This module generates a projected synthetic benchmark extending the 30-day weather
  variability model across 5 to 10 years using documented industry-standard planning
  assumptions.

Standard Planning Assumptions (Documented & Citable):
  1. Solar PV Degradation:
     - 0.5% annual output decline (industry-standard assumption for silicon PV modules,
       consistent with NREL PV degradation benchmarks and IEC 61215 standards).
  2. TPCODL Tariff Escalation:
     - 3.5% annual escalation (conservative planning estimate for commercial Time-of-Use
       rates in Odisha; clearly marked as a planning assumption, not a published TPCODL forecast).
  3. Second-Life Battery Aging Trajectory:
     - Reuses the existing semi-empirical Li-ion NMC degradation model from
       optimizer/battery_health.py (2.5% fade per 100 cycles + 1.5%/yr calendar aging).
  4. Grid Carbon Factor:
     - 0.82 kg CO2 / kWh (Central Electricity Authority CEA baseline for Indian grid).
"""

from pathlib import Path
import sys

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from optimizer.battery_health import BatteryHealthState


PROJECTED_DATA_DISCLAIMER = (
    "Projected using documented industry-standard assumptions; "
    "not derived from real historical campus records, which are not publicly available."
)

GRID_CO2_KG_PER_KWH = 0.82

# Base seasonal solar irradiation (kWh/day typical for 1600 kWp SOA ITER array)
# Bhubaneswar climate: high summer irradiance (Mar-May), monsoon drop (Jun-Sep), clear winter (Oct-Feb)
MONTHLY_SOLAR_BASE_KWH = [
    5400.0,  # Jan
    6100.0,  # Feb
    7200.0,  # Mar
    7800.0,  # Apr
    7600.0,  # May
    5100.0,  # Jun (Monsoon onset)
    4200.0,  # Jul (Heavy Monsoon)
    4400.0,  # Aug (Monsoon)
    4900.0,  # Sep (Monsoon retreat)
    5900.0,  # Oct
    5600.0,  # Nov
    5200.0,  # Dec
]

# Base monthly campus electrical demand (kWh/day across 16 buildings)
MONTHLY_DEMAND_BASE_KWH = [
    19500.0,  # Jan (Mild winter)
    20500.0,  # Feb
    23800.0,  # Mar (AC start)
    27500.0,  # Apr (Peak summer)
    28200.0,  # May (Peak summer heat)
    25400.0,  # Jun
    23100.0,  # Jul
    22800.0,  # Aug
    23500.0,  # Sep
    21900.0,  # Oct
    20200.0,  # Nov
    19200.0,  # Dec
]

# Days per month (non-leap year standard)
DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

# Weather pattern multipliers (same 45/30/15/10% distribution as 30-day generator)
# Clear: 1.05x, Partly Cloudy: 0.82x, Overcast: 0.55x, Monsoon: 0.25x
WEATHER_WEIGHTED_SOLAR_FACTOR = 0.45 * 1.05 + 0.30 * 0.82 + 0.15 * 0.55 + 0.10 * 0.25  # ~0.826


def generate_multiyear_projection(
    years: int = 5,
    solar_degradation_pct: float = 0.5,
    tariff_escalation_pct: float = 3.5,
    include_battery_aging: bool = True,
    rated_battery_capacity_kwh: float = 360.0,
    rated_battery_power_kw: float = 120.0,
) -> dict:
    """
    Generates a multi-year synthetic projection series for campus energy, financials,
    carbon abatement, battery SoH, and fairness metrics.
    """
    years = max(1, min(int(years), 10))
    
    # Initialize shared battery health state from optimizer/battery_health.py
    battery = BatteryHealthState(
        rated_capacity_kwh=rated_battery_capacity_kwh,
        rated_power_kw=rated_battery_power_kw,
        soh_pct=82.0,  # Second-life entry point
    )

    yearly_summary = []
    monthly_trend = []
    
    cumulative_savings_inr = 0.0
    cumulative_co2_abated_kg = 0.0
    cumulative_solar_kwh = 0.0

    # Base weighted average ToU electricity price (₹/kWh) for Odisha commercial tariff
    # Peak (₹8.50), Normal (₹6.80), Off-Peak (₹4.50) weighted average ~₹6.75 / kWh
    base_avg_tariff_per_kwh = 6.75

    for y in range(1, years + 1):
        # 1. Yearly trend factors
        pv_factor = (1.0 - (solar_degradation_pct / 100.0)) ** (y - 1)
        tariff_multiplier = (1.0 + (tariff_escalation_pct / 100.0)) ** (y - 1)
        effective_tariff = base_avg_tariff_per_kwh * tariff_multiplier

        year_solar_kwh = 0.0
        year_demand_kwh = 0.0
        year_battery_throughput_kwh = 0.0

        for m_idx in range(12):
            days_in_month = DAYS_PER_MONTH[m_idx]
            base_solar_day = MONTHLY_SOLAR_BASE_KWH[m_idx] * WEATHER_WEIGHTED_SOLAR_FACTOR * pv_factor
            base_demand_day = MONTHLY_DEMAND_BASE_KWH[m_idx]

            month_solar_kwh = base_solar_day * days_in_month
            month_demand_kwh = base_demand_day * days_in_month
            
            # Daily battery cycling throughput (average ~135 kWh/day self-consumption + arbitrage)
            # Derates as battery SoH degrades
            battery_derate = battery.derate_factor if include_battery_aging else 1.0
            month_battery_throughput = 135.0 * battery_derate * days_in_month

            if include_battery_aging:
                for _ in range(days_in_month):
                    battery.record_day_cycling(135.0 * battery_derate)

            year_solar_kwh += month_solar_kwh
            year_demand_kwh += month_demand_kwh
            year_battery_throughput_kwh += month_battery_throughput

            # Monthly trend point
            monthly_trend.append({
                "year": y,
                "month": m_idx + 1,
                "month_label": f"Y{y}-M{m_idx+1}",
                "solar_kwh": round(month_solar_kwh, 1),
                "demand_kwh": round(month_demand_kwh, 1),
                "battery_soh_pct": round(battery.soh_pct, 2),
                "tariff_rate_inr": round(effective_tariff, 2),
            })

        # 2. Annual energy balance & self-consumption
        # Self-consumed solar is ~88% of generated solar (12% excess absorbed by battery or driEV)
        self_consumed_solar_kwh = year_solar_kwh * 0.88
        battery_useful_discharge_kwh = year_battery_throughput_kwh * 0.46  # Useful peak discharge
        grid_energy_avoided_kwh = self_consumed_solar_kwh + battery_useful_discharge_kwh
        grid_import_kwh = max(year_demand_kwh - grid_energy_avoided_kwh, 0.0)

        # 3. Financial calculations (₹ ToU Escalated)
        baseline_cost_inr = year_demand_kwh * effective_tariff
        optimized_cost_inr = grid_import_kwh * effective_tariff
        annual_savings_inr = baseline_cost_inr - optimized_cost_inr

        # 4. Environmental & Fairness
        annual_co2_abated_kg = grid_energy_avoided_kwh * GRID_CO2_KG_PER_KWH
        # Fairness index slowly adjusts with battery derating (from 0.96 down to ~0.91 in later years)
        battery_derate = battery.derate_factor if include_battery_aging else 1.0
        avg_fairness_index = round(0.92 + (0.04 * battery_derate), 3)

        cumulative_savings_inr += annual_savings_inr
        cumulative_co2_abated_kg += annual_co2_abated_kg
        cumulative_solar_kwh += year_solar_kwh

        yearly_summary.append({
            "year": y,
            "year_label": f"Year {y}",
            "solar_kwh": round(year_solar_kwh, 1),
            "solar_mwh": round(year_solar_kwh / 1000.0, 2),
            "campus_demand_kwh": round(year_demand_kwh, 1),
            "grid_avoided_kwh": round(grid_energy_avoided_kwh, 1),
            "grid_import_kwh": round(grid_import_kwh, 1),
            "annual_savings_inr": round(annual_savings_inr, 2),
            "annual_savings_lakhs": round(annual_savings_inr / 100000.0, 2),
            "cumulative_savings_lakhs": round(cumulative_savings_inr / 100000.0, 2),
            "baseline_cost_inr": round(baseline_cost_inr, 2),
            "optimized_cost_inr": round(optimized_cost_inr, 2),
            "co2_abated_kg": round(annual_co2_abated_kg, 1),
            "co2_abated_tonnes": round(annual_co2_abated_kg / 1000.0, 2),
            "cumulative_co2_tonnes": round(cumulative_co2_abated_kg / 1000.0, 2),
            "avg_fairness_index": avg_fairness_index,
            "fairness_pct": round(avg_fairness_index * 100.0, 1),
            "battery_soh_pct": round(battery.soh_pct, 2),
            "battery_duty_tier": battery.duty_tier,
            "effective_tariff_multiplier": round(tariff_multiplier, 4),
            "effective_tariff_inr": round(effective_tariff, 2),
            "solar_degradation_factor": round(pv_factor, 4),
        })

    return {
        "status": "success",
        "data_type": "synthetic_projection",
        "disclaimer": PROJECTED_DATA_DISCLAIMER,
        "years_requested": years,
        "assumptions": {
            "solar_degradation_annual_pct": solar_degradation_pct,
            "solar_degradation_citation": "Standard silicon PV 0.5%/yr degradation (NREL / IEC 61215 PV planning standard)",
            "tariff_escalation_annual_pct": tariff_escalation_pct,
            "tariff_escalation_citation": "Planning assumption for commercial Time-of-Use escalation (not a published TPCODL forecast)",
            "battery_aging_model": "Semi-empirical Li-ion NMC second-life degradation (optimizer/battery_health.py)",
            "grid_co2_factor_kg_kwh": GRID_CO2_KG_PER_KWH,
            "weather_distribution": "45% Clear / 30% Partly Cloudy / 15% Overcast / 10% Monsoon",
        },
        "totals": {
            "total_years": years,
            "cumulative_savings_inr": round(cumulative_savings_inr, 2),
            "cumulative_savings_lakhs": round(cumulative_savings_inr / 100000.0, 2),
            "cumulative_co2_abated_tonnes": round(cumulative_co2_abated_kg / 1000.0, 2),
            "cumulative_solar_mwh": round(cumulative_solar_kwh / 1000.0, 2),
            "final_battery_soh_pct": round(battery.soh_pct, 2),
            "final_battery_duty_tier": battery.duty_tier,
        },
        "yearly_summary": yearly_summary,
        "monthly_trend": monthly_trend,
    }


if __name__ == "__main__":
    result = generate_multiyear_projection(years=5)
    print("=== 5-Year Synthetic Projection Result ===")
    print(f"Data Type: {result['data_type']}")
    print(f"Disclaimer: {result['disclaimer']}")
    print(f"Total Projected Savings: INR {result['totals']['cumulative_savings_lakhs']} Lakhs")
    for row in result["yearly_summary"]:
        print(f"Year {row['year']}: Solar={row['solar_mwh']} MWh, Savings=INR {row['annual_savings_lakhs']}L, SoH={row['battery_soh_pct']}%, Tariff={row['effective_tariff_inr']}/kWh, Fairness={row['fairness_pct']}%")
