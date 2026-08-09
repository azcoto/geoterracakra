#!/usr/bin/env python3
"""Download the Esri 10 m annual LULC tiles for the Malang AOI from Earth Engine.

The AOI is the Kabupaten Malang bounding box. Kabupaten Malang contains Kota
Malang in the source boundary, so this single extent deliberately covers both.
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

import ee
import requests

ASSET_ID = "projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS"
# [west, south, east, north] from the restored Kabupaten Malang (KDPKAB 35.07) boundary.
MALANG_BBOX = (112.28740688500011, -8.463946963999945, 112.9499657990001, -7.76151763799993)
DEFAULT_YEARS = (2020, 2021, 2022, 2023, 2025)


def load_project_from_dotenv() -> None:
    """Load only EARTHENGINE_PROJECT from the repository's local .env, if present."""
    dotenv = Path(__file__).resolve().parents[4] / ".env"
    if os.environ.get("EARTHENGINE_PROJECT") or not dotenv.is_file():
        return

    for line in dotenv.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key == "EARTHENGINE_PROJECT":
            os.environ[key] = value
            return


def tile_bounds(bbox: tuple[float, float, float, float], tile_size: float):
    west, south, east, north = bbox
    row = 0
    current_south = south
    while current_south < north:
        current_north = min(current_south + tile_size, north)
        column = 0
        current_west = west
        while current_west < east:
            current_east = min(current_west + tile_size, east)
            yield row, column, (current_west, current_south, current_east, current_north)
            column += 1
            current_west = current_east
        row += 1
        current_south = current_north


def download_year(year: int, output_dir: Path, tile_size: float) -> None:
    image = ee.ImageCollection(ASSET_ID).filterDate(f"{year}-01-01", f"{year + 1}-01-01").mosaic()
    output_dir.mkdir(parents=True, exist_ok=True)

    for row, column, bounds in tile_bounds(MALANG_BBOX, tile_size):
        output_path = output_dir / f"esri-worldcover-{year}-r{row:02d}-c{column:02d}.tif"
        if output_path.exists():
            print(f"exists  {output_path}")
            continue

        region = ee.Geometry.Rectangle(bounds, proj="EPSG:4326", geodesic=False)
        url = image.getDownloadURL(
            {
                "crs": "EPSG:4326",
                "filePerBand": False,
                "format": "GEO_TIFF",
                "region": region,
                "scale": 10,
            }
        )
        for attempt in range(5):
            response = requests.get(url, timeout=180)
            if response.status_code not in {429, 503} or attempt == 4:
                response.raise_for_status()
                break
            delay = 2**attempt
            print(f"retry   {output_path} ({response.status_code}; waiting {delay}s)", flush=True)
            time.sleep(delay)
        output_path.write_bytes(response.content)
        print(f"saved   {output_path}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, nargs="+", default=list(DEFAULT_YEARS), help="Esri annual map years to download (available: 2017–2025)")
    parser.add_argument("--output", type=Path, default=Path("data/imagery/esri-worldcover"), help="Output directory")
    parser.add_argument("--tile-size", type=float, default=0.1, help="Tile width/height in degrees; smaller avoids Earth Engine download limits")
    args = parser.parse_args()

    load_project_from_dotenv()
    project = os.environ.get("EARTHENGINE_PROJECT")
    if not project:
        raise SystemExit("EARTHENGINE_PROJECT is required. Add it to the repository .env or export it in your shell.")

    unsupported = [year for year in args.years if year < 2017 or year > 2025]
    if unsupported:
        raise SystemExit(f"Esri WorldCover is available only for 2017–2025; unsupported years: {unsupported}")

    ee.Initialize(project=project)
    for year in args.years:
        download_year(year, args.output / str(year), args.tile_size)


if __name__ == "__main__":
    main()
