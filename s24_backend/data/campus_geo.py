"""
campus_geo.py
--------------
Loads REAL SOA ITER campus building footprints (pulled from OpenStreetMap
via Overpass — see data/campus_data/osm_buildings.json) and computes actual
geometry-derived numbers: rooftop footprint area, gross floor area (footprint
x levels), and centroid — replacing the arbitrary placeholder kWp/kW values
used earlier with figures grounded in the real campus map.

This is the same 16-building dataset visible in the reference campus map
image (A-Block, C-block, D-block, F/G/S-Block, Central Library, Bansuri
Guru Auditorium, ITER Cafeteria, Centre for Data Science, ITER
Administrative Block, and ITER Boys Hostels 1/2/7).

Source data licence: © OpenStreetMap contributors, ODbL
(https://www.openstreetmap.org/copyright) — keep this attribution in any
report/dashboard that displays this data, per ODbL share-alike terms.
"""

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

OSM_DATA_PATH = Path(__file__).parent / "campus_data" / "osm_buildings.json"

EARTH_RADIUS_M = 6371000.0


@dataclass
class CampusBuilding:
    osm_id: int
    name: str
    building_type: str          # OSM 'building' tag value: college, dormitory, yes, etc.
    amenity: str | None         # e.g. 'conference_centre', 'fast_food'
    levels: int
    footprint_m2: float          # roof/ground footprint area
    gross_floor_area_m2: float   # footprint x levels — total usable floor area
    centroid_lat: float
    centroid_lon: float
    ring: list[tuple[float, float]] = field(default_factory=list)  # (lat, lon) polygon, for map rendering


def _polygon_area_m2(ring: list[tuple[float, float]]) -> float:
    """
    Geodesic-ish polygon area for a small footprint (tens of metres across):
    equirectangular projection (scale longitude by cos(mean latitude)) then
    the standard shoelace formula. Accurate to well under 1% error at this
    scale — fine for solar-sizing and floor-area estimates.
    """
    if len(ring) < 3:
        return 0.0
    mean_lat = sum(p[0] for p in ring) / len(ring)
    lat_scale = math.pi / 180.0 * EARTH_RADIUS_M
    lon_scale = lat_scale * math.cos(math.radians(mean_lat))

    xy = [(lon * lon_scale, lat * lat_scale) for lat, lon in ring]
    area = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def load_campus_buildings(path: Path = OSM_DATA_PATH) -> list[CampusBuilding]:
    with open(path) as f:
        data = json.load(f)

    buildings = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        ring = [(pt["lat"], pt["lon"]) for pt in el["geometry"]]
        if len(ring) < 3:
            continue

        area = _polygon_area_m2(ring)
        levels = int(tags.get("building:levels", 1) or 1)
        centroid_lat = sum(p[0] for p in ring) / len(ring)
        centroid_lon = sum(p[1] for p in ring) / len(ring)

        buildings.append(CampusBuilding(
            osm_id=el["id"],
            name=tags.get("name", f"Unnamed building {el['id']}"),
            building_type=tags.get("building", "yes"),
            amenity=tags.get("amenity"),
            levels=levels,
            footprint_m2=round(area, 1),
            gross_floor_area_m2=round(area * levels, 1),
            centroid_lat=round(centroid_lat, 7),
            centroid_lon=round(centroid_lon, 7),
            ring=ring,
        ))
    return buildings


def to_geojson(buildings: list[CampusBuilding]) -> dict:
    """Exports enriched building data as GeoJSON, for the React/Leaflet dashboard map."""
    features = []
    for b in buildings:
        features.append({
            "type": "Feature",
            "properties": {
                "osm_id": b.osm_id,
                "name": b.name,
                "building_type": b.building_type,
                "amenity": b.amenity,
                "levels": b.levels,
                "footprint_m2": b.footprint_m2,
                "gross_floor_area_m2": b.gross_floor_area_m2,
            },
            "geometry": {
                "type": "Polygon",
                # GeoJSON is [lon, lat] order
                "coordinates": [[[lon, lat] for lat, lon in b.ring]],
            },
        })
    return {
        "type": "FeatureCollection",
        "attribution": "© OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright",
        "features": features,
    }


if __name__ == "__main__":
    buildings = load_campus_buildings()
    print(f"Loaded {len(buildings)} real campus buildings:\n")
    for b in sorted(buildings, key=lambda x: -x.footprint_m2):
        print(f"  {b.name:32s} type={b.building_type:10s} levels={b.levels}  "
              f"footprint={b.footprint_m2:7.1f}m²  gross_floor={b.gross_floor_area_m2:8.1f}m²  "
              f"centroid=({b.centroid_lat:.5f},{b.centroid_lon:.5f})")

    total_footprint = sum(b.footprint_m2 for b in buildings)
    total_gfa = sum(b.gross_floor_area_m2 for b in buildings)
    print(f"\nTotal mapped footprint: {total_footprint:,.0f} m²  |  Total gross floor area: {total_gfa:,.0f} m²")
