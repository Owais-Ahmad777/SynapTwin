"""
synthetic_load.py
------------------
Generates realistic 24-hour electrical load curves (kW, hourly) for all 16
SOA ITER campus buildings based on actual OpenStreetMap building footprints,
levels, and institutional building usage models.

Models realistic diurnal patterns:
1. Night Hours (22:00 - 06:00 / 10 PM to 6 AM):
   - Academic & Administrative Buildings: Exactly 0.0 kW (closed overnight).
   - Residential Hostels: High baseline (0.80 - 0.95 of peak) reflecting peak residential usage
     (lighting, AC/coolers, fans, laptops, appliances, overnight occupancy).
2. Daytime & Evening Hours (06:00 - 22:00 / 6 AM to 10 PM):
   - Academic & Administrative: Peaking during class/office hours (08:00-13:00 & 14:00-18:00),
     with a distinct lunch dip at 13:00-14:00, tapering 18:00-21:00, dropping to 0 at 22:00.
   - Residential Hostels: Active background consumption (0.35-0.40 during classes), morning prep
     spike (07:00-09:00), lunch-break spike (13:00-14:00), and evening rise (18:00-21:00).
   - Cafeteria & Dining: High continuous demand from 06:00 to 21:00, 0.0 kW overnight.
"""

import math
import random
from dataclasses import dataclass


@dataclass
class Block:
    name: str
    block_type: str  # "hostel" | "academic" | "cafeteria" | "hospital"
    peak_kw: float
    critical_kw: float = 0.0  # portion treated as non-sheddable (corridor lights, pumps, IT servers)
    solar_kwp: float = 0.0    # rooftop PV capacity installed on this block
    osm_id: int | None = None
    footprint_m2: float | None = None
    centroid_lat: float | None = None
    centroid_lon: float | None = None


# Physical parameters grounded in SOA ITER building footprints:
ROOF_USABLE_FRACTION = 0.60
PANEL_DENSITY_WP_PER_M2 = 150.0
HOSTEL_PEAK_DENSITY_W_PER_M2 = 18.0
ACADEMIC_PEAK_DENSITY_W_PER_M2 = 30.0
CAFETERIA_PEAK_DENSITY_W_PER_M2 = 35.0
CRITICAL_LOAD_FRACTION = 0.12


def real_campus_blocks() -> list[Block]:
    """
    Builds Block models for ALL 16 real SOA ITER buildings from OpenStreetMap geometry.
    """
    try:
        from data.campus_geo import load_campus_buildings
    except ImportError:
        from campus_geo import load_campus_buildings

    buildings = load_campus_buildings()
    blocks = []

    for b in buildings:
        # Standardize canonical campus building names
        raw_name = b.name
        lower_name = raw_name.lower()
        if "825753849" in str(b.osm_id) or "research" in lower_name:
            name = "Research & Innovation Wing"
        elif "1126221949" in str(b.osm_id) or "substation" in lower_name or "utility" in lower_name:
            name = "Campus Utility Substation"
        elif "c-block" in lower_name:
            name = "C-Block (Academic)"
        elif "d-block" in lower_name:
            name = "D-Block"
        elif "a-block" in lower_name:
            name = "A-Block"
        elif "1523416740" in str(b.osm_id) or "f-block" in lower_name:
            name = "F-Block"
        elif "1523416739" in str(b.osm_id) or "g-block" in lower_name:
            name = "G-Block"
        elif "1523416738" in str(b.osm_id) or "s-block" in lower_name or "sports" in lower_name:
            name = "S-Block (Sports Complex)"
        elif "1043463348" in str(b.osm_id) or "hostel 1" in lower_name or "hostel 01" in lower_name or "hostel-1" in lower_name:
            name = "ITER Boys Hostel 1"
        elif "1043463347" in str(b.osm_id) or "hostel 2" in lower_name or "hostel 02" in lower_name or "hostel-2" in lower_name:
            name = "ITER Boys Hostel 2"
        elif "1523367317" in str(b.osm_id) or "hostel 7" in lower_name or "hostel 07" in lower_name or "hostel-7" in lower_name:
            name = "ITER Boys Hostel 7"
        elif "1043463349" in str(b.osm_id) or "administrative" in lower_name or "admin" in lower_name:
            name = "ITER Administrative Block"
        elif "1043464923" in str(b.osm_id) or "cafeteria" in lower_name or "canteen" in lower_name or "dining" in lower_name:
            name = "ITER Cafeteria & Dining"
        elif "1327180956" in str(b.osm_id) or "library" in lower_name:
            name = "Central Library"
        elif "1043464922" in str(b.osm_id) or "auditorium" in lower_name or "bansuri" in lower_name:
            name = "Bansuri Guru Auditorium"
        elif "1523427652" in str(b.osm_id) or "data science" in lower_name:
            name = "Centre for Data Science"
        else:
            name = raw_name

        # Determine block type & load density
        lower_name = name.lower()
        levels = b.levels
        
        if "hostel 1" in lower_name:
            btype = "hostel"
            levels = 4  # 4-story residential block
            density = HOSTEL_PEAK_DENSITY_W_PER_M2
        elif "hostel 2" in lower_name:
            btype = "hostel"
            levels = 4  # 4-story residential block
            density = HOSTEL_PEAK_DENSITY_W_PER_M2
        elif "hostel 7" in lower_name:
            btype = "hostel"
            levels = 5  # 5-story fully air-conditioned modern residential block
            density = HOSTEL_PEAK_DENSITY_W_PER_M2 * 1.25  # Fully AC residential density
        elif "library" in lower_name:
            btype = "library"
            density = ACADEMIC_PEAK_DENSITY_W_PER_M2
        elif "data science" in lower_name:
            btype = "academic"
            levels = 3  # 3-story High Performance Computing & AI lab
            density = 40.0  # Server racks, GPU clusters, workstation density
        elif "cafeteria" in lower_name or "canteen" in lower_name or "dining" in lower_name:
            btype = "cafeteria"
            density = CAFETERIA_PEAK_DENSITY_W_PER_M2
        elif "hostel" in lower_name or "dormitory" in str(b.amenity or "").lower():
            btype = "hostel"
            levels = 4
            density = HOSTEL_PEAK_DENSITY_W_PER_M2
        else:
            btype = "academic"
            density = ACADEMIC_PEAK_DENSITY_W_PER_M2

        # Floor area calculation
        gross_floor_area_m2 = b.footprint_m2 * levels

        # Rooftop solar PV (kWp)
        solar_kwp = round(b.footprint_m2 * ROOF_USABLE_FRACTION * PANEL_DENSITY_WP_PER_M2 / 1000.0, 1)

        # Connected peak load
        peak_kw = round(gross_floor_area_m2 * density / 1000.0, 1)
        critical_kw = round(peak_kw * CRITICAL_LOAD_FRACTION, 1)

        blocks.append(Block(
            name=name,
            block_type=btype,
            peak_kw=peak_kw,
            critical_kw=critical_kw,
            solar_kwp=solar_kwp,
            osm_id=b.osm_id,
            footprint_m2=b.footprint_m2,
            centroid_lat=b.centroid_lat,
            centroid_lon=b.centroid_lon,
        ))

    return blocks


def _gauss_bump(h: int, center: float, width: float) -> float:
    return math.exp(-((h - center) ** 2) / (2 * width ** 2))


def _shape_hostel() -> list[float]:
    """
    Residential Hostel Profile:
    - Night Hours (22:00 - 06:00): High residential baseline (0.80 - 0.95) for peak nighttime
      occupancy (lights, air conditioning, coolers, fans, laptops, appliances).
    - Morning bump (07:00 - 09:00): 0.75 (showers, geysers, prep).
    - Class hours (10:00 - 12:00 & 14:00 - 17:00): 0.36 - 0.40 (background student activity).
    - Lunch-break secondary spike (13:00 - 14:00): 0.65 (students return to rooms).
    - Evening return (18:00 - 21:00): 0.80 - 0.90 (dinner, study, leisure).
    """
    shape = []
    for h in range(24):
        if h >= 22 or h <= 5:
            # 10 PM to 6 AM: High night residential usage
            val = 0.85 + 0.08 * _gauss_bump(h if h <= 5 else h - 24, center=0.0, width=3.0)
        elif h == 6:
            val = 0.72
        elif 7 <= h <= 9:
            val = 0.75 + 0.08 * _gauss_bump(h, center=8.0, width=1.0)
        elif 10 <= h <= 12:
            val = 0.38
        elif h == 13:
            val = 0.65  # Lunch break bump
        elif 14 <= h <= 17:
            val = 0.38
        elif 18 <= h <= 21:
            val = 0.78 + 0.12 * _gauss_bump(h, center=20.0, width=1.5)
        else:
            val = 0.85
        shape.append(round(min(max(val, 0.30), 1.0), 3))
    return shape


def _shape_academic() -> list[float]:
    """
    Academic / Administrative / Institutional Block Profile:
    - Night Hours (22:00 - 06:00 / 10 PM to 6 AM): Strictly 0.0 kW (closed overnight).
    - Morning ramp-up (06:00 - 07:00): 0.10 - 0.28 (opening, cleaning, staff arriving).
    - Morning class hours (08:00 - 12:00): 0.88 - 0.98 (lecture halls, labs, ACs, computers).
    - Lunch dip (13:00): 0.45 (classes paused, rooms vacated for lunch).
    - Afternoon class hours (14:00 - 17:00): 0.84 - 0.92 (labs, tutorials, research).
    - Evening shutdown (18:00 - 21:00): 0.38 -> 0.18 -> 0.08 -> 0.03 (classes end, lights off).
    """
    shape = []
    for h in range(24):
        if h >= 22 or h <= 5:
            # 10 PM to 6 AM: Strictly 0.0 kW
            val = 0.0
        elif h == 6:
            val = 0.10
        elif h == 7:
            val = 0.28
        elif 8 <= h <= 12:
            val = 0.88 + 0.10 * _gauss_bump(h, center=10.5, width=2.0)
        elif h == 13:
            val = 0.45  # Distinct lunch dip
        elif 14 <= h <= 17:
            val = 0.84 + 0.08 * _gauss_bump(h, center=15.5, width=1.8)
        elif h == 18:
            val = 0.38
        elif h == 19:
            val = 0.18
        elif h == 20:
            val = 0.08
        elif h == 21:
            val = 0.03
        else:
            val = 0.0
        shape.append(round(min(max(val, 0.0), 1.0), 3))
    return shape


def _shape_cafeteria() -> list[float]:
    """
    Cafeteria & Dining Facility Profile:
    - 06:00 - 21:00: Active kitchen & meal rushes (breakfast, lunch, snacks, dinner).
    - 22:00 - 05:00: 0.0 kW (Closed overnight).
    """
    shape = []
    for h in range(24):
        if h >= 22 or h <= 5:
            val = 0.0
        elif h == 6:
            val = 0.25
        elif 7 <= h <= 21:
            base_kitchen = 0.70
            breakfast = 0.18 * _gauss_bump(h, center=8.5, width=1.0)
            lunch = 0.28 * _gauss_bump(h, center=13.0, width=1.2)
            dinner = 0.26 * _gauss_bump(h, center=20.0, width=1.2)
            val = min(base_kitchen + breakfast + lunch + dinner, 1.0)
        else:
            val = 0.0
        shape.append(round(min(max(val, 0.0), 1.0), 3))
    return shape


def _shape_library() -> list[float]:
    """
    Central Library Profile:
    - 08:00 to 21:00 (8 AM - 9 PM): Active reading halls, AC chillers, study lights, computing desks.
    - 21:00 to 08:00 (9 PM - 8 AM / Hours 21 through 7): STRICTLY 0.0 kW (closed overnight).
    """
    shape = []
    for h in range(24):
        if 8 <= h <= 20:
            if 8 <= h <= 12:
                val = 0.85 + 0.12 * _gauss_bump(h, center=11.0, width=2.0)
            elif h == 13:
                val = 0.50  # slight lunch break dip
            elif 14 <= h <= 18:
                val = 0.88 + 0.10 * _gauss_bump(h, center=16.0, width=1.8)
            else:
                val = 0.80  # evening study rush (19:00 - 20:59)
        else:
            # 21:00 to 08:00 (9 PM to 8 AM): Strictly 0.0 kW
            val = 0.0
        shape.append(round(min(max(val, 0.0), 1.0), 3))
    return shape


def _shape_hospital() -> list[float]:
    """Flat always-on critical baseline."""
    return [0.75 + 0.1 * _gauss_bump(h, center=11, width=6) for h in range(24)]


SHAPES = {
    "hostel": _shape_hostel,
    "academic": _shape_academic,
    "library": _shape_library,
    "cafeteria": _shape_cafeteria,
    "hospital": _shape_hospital,
}


def get_building_day_multiplier(block: Block, day_name: str = "Mon", day_type: str = "weekday") -> float:
    """
    Computes building-specific occupancy/operations multipliers based on day of week:
    - Academic / Administrative / Library / Data Science / Labs / Auditorium:
        * Sunday: 0.20 (Skeleton load only: server baselines, security, emergency lighting)
        * Saturday: 0.50 (Half-day / partial labs / weekend study)
        * Weekdays (Mon-Fri): 1.00 (Full academic schedule)
    - Residential Hostels (Hostels 1, 2, 7):
        * Sunday: 0.98 (Residents remain in rooms all day, continuous occupancy)
        * Saturday: 0.96
        * Weekdays (Mon-Fri): 1.00
    - Sports Complex / Cafeteria & Dining:
        * Sunday: 0.45 (Weekend recreation & dining, but no scheduled class crowds)
        * Saturday: 0.72
        * Weekdays (Mon-Fri): 1.00
    - Mixed-use blocks (A-Block, F-Block, G-Block):
        * Sunday: 0.52
        * Saturday: 0.72
        * Weekdays (Mon-Fri): 1.00
    - Campus Utility Substation:
        * Sunday / Saturday / Weekdays: 1.00 (Continuous grid/transformer telemetry load)
    """
    name_low = block.name.lower()
    day_low = day_name.lower()
    is_sunday = day_low in ("sun", "sunday") or (day_type == "weekend" and "sun" in day_low)
    is_saturday = day_low in ("sat", "saturday") or (day_type == "weekend" and not is_sunday)

    if not (is_sunday or is_saturday):
        return 1.0

    if "substation" in name_low or "utility" in name_low:
        return 1.0
    elif "hostel" in name_low or block.block_type == "hostel":
        return 0.98 if is_sunday else 0.96
    elif "library" in name_low or "academic" in name_low or "c-block" in name_low or "d-block" in name_low or "admin" in name_low or "data science" in name_low or "auditorium" in name_low or "research" in name_low:
        return 0.20 if is_sunday else 0.50
    elif "cafeteria" in name_low or "canteen" in name_low or "dining" in name_low or "sports" in name_low or "s-block" in name_low or block.block_type == "cafeteria":
        return 0.45 if is_sunday else 0.72
    elif "a-block" in name_low or "f-block" in name_low or "g-block" in name_low:
        return 0.52 if is_sunday else 0.72
    else:
        return 0.25 if is_sunday else 0.55


def generate_load_curve(block: Block, noise_frac: float = 0.02, seed: int | None = None, day_name: str = "Mon", day_type: str = "weekday") -> list[float]:
    rng = random.Random((seed or 42) + (block.osm_id or 0) % 100)
    shape_fn = SHAPES.get(block.block_type, _shape_academic)
    shape = shape_fn()
    day_mult = get_building_day_multiplier(block, day_name=day_name, day_type=day_type)
    curve = []
    for h in range(24):
        val = shape[h] * day_mult
        if val <= 0.0:
            curve.append(0.0)
        else:
            noise = val * rng.uniform(-noise_frac, noise_frac)
            curve.append(round(max(0.0, block.peak_kw * (val + noise)), 2))
    return curve


def generate_all(blocks: list[Block] = None, seed: int | None = 42, day_name: str = "Mon", day_type: str = "weekday") -> dict[str, list[float]]:
    blocks = blocks or real_campus_blocks()
    return {b.name: generate_load_curve(b, seed=seed, day_name=day_name, day_type=day_type) for b in blocks}


if __name__ == "__main__":
    blocks = real_campus_blocks()
    curves = generate_all(blocks)
    
    print(f"Loaded {len(blocks)} campus blocks. Diurnal Profiles Test:")
    for bname in ["ITER Boys Hostel 1", "C-Block (Academic)", "ITER Cafeteria & Dining"]:
        if bname in curves:
            c = curves[bname]
            print(f"\n{bname} (24h kW):")
            print(f"  00:00-06:00 (Night)   : {[round(x, 1) for x in c[0:7]]}")
            print(f"  07:00-12:00 (Morning) : {[round(x, 1) for x in c[7:13]]}")
            print(f"  13:00-14:00 (Lunch)   : {[round(x, 1) for x in c[13:15]]}")
            print(f"  15:00-18:00 (Afternoon): {[round(x, 1) for x in c[15:19]]}")
            print(f"  19:00-23:00 (Evening) : {[round(x, 1) for x in c[19:24]]}")
