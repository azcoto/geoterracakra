#!/usr/bin/env python3
"""Vectorize landcover pixels into the per-grid PostGIS table.

Two input layouts are supported:

* `malang-data` (default): one GeoTIFF per area per year, e.g.
  `data/imagery/malang-data/2024/LandCover_Kab_Malang_2024.tif` and
  `LandCover_Kota_Malang_2024.tif`. Each area is clipped to its own
  administrative boundary and stored with an `area` code.
* `esri-worldcover`: a flat per-year folder of EPSG:4326 tiles covering the
  merged Malang Raya extent.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections.abc import Generator, Iterable, Sequence
from contextlib import contextmanager
from pathlib import Path

import psycopg
import rasterio
from rasterio.enums import Resampling
from rasterio.features import shapes
from rasterio.io import MemoryFile
from rasterio.mask import mask
from rasterio.merge import merge
from rasterio.vrt import WarpedVRT

DEFAULT_YEARS = (2020, 2021, 2022, 2023, 2025)
SOURCE = "malang-landcover"
METHODOLOGY = "manual"
AREA_KODES = {"Kab": "35.07", "Kota": "35.73"}
AREA_RASTER_RE = re.compile(r"^LandCover_(?P<area>Kab|Kota)_Malang_(?P<year>\d{4})\.tif$")


def load_dotenv() -> None:
    """Load DATABASE_URL from the repository .env without overriding the shell."""
    dotenv = Path(__file__).resolve().parents[4] / ".env"
    if os.environ.get("DATABASE_URL") or not dotenv.is_file():
        return
    for line in dotenv.read_text().splitlines():
        key, separator, value = line.partition("=")
        if key == "DATABASE_URL" and separator:
            os.environ[key] = value
            return


def discover_malang_years(input_dir: Path) -> list[int]:
    """Return the years that have at least one Malang raster under input_dir."""
    years: set[int] = set()
    for path in input_dir.glob("*/LandCover_*_Malang_*.tif"):
        match = AREA_RASTER_RE.match(path.name)
        if match:
            years.add(int(match.group("year")))
    return sorted(years)


def malang_area_rasters(input_dir: Path, year: int) -> dict[str, Path]:
    """Map area name (Kab/Kota) to its raster for the given year."""
    rasters: dict[str, Path] = {}
    for path in sorted((input_dir / str(year)).glob("LandCover_*_Malang_*.tif")):
        match = AREA_RASTER_RE.match(path.name)
        if match and int(match.group("year")) == year:
            rasters[match.group("area")] = path
    missing = [area for area in AREA_KODES if area not in rasters]
    if missing:
        raise FileNotFoundError(
            f"Missing Malang rasters for {year} in {input_dir / str(year)}: {missing}"
        )
    return rasters


def load_tiles(input_dir: Path, year: int) -> list[Path]:
    tiles: list[Path] = []
    for path in sorted((input_dir / str(year)).glob("*.tif")):
        with rasterio.open(path) as dataset:
            if dataset.crs is None or dataset.crs.to_epsg() != 4326:
                raise ValueError(f"{path} must use EPSG:4326")
            tiles.append(path)
    if not tiles:
        raise FileNotFoundError(f"No GeoTIFFs found for {year} in {input_dir}")
    return tiles


@contextmanager
def open_mosaic(tiles: list[Path]) -> Generator[rasterio.io.DatasetWriter, None, None]:
    """Combine overlapping Earth Engine downloads into one pixel-aligned raster."""
    sources = [rasterio.open(path) for path in tiles]
    try:
        pixels, transform = merge(sources, method="first", nodata=0)
        profile = {
            "count": pixels.shape[0],
            "crs": sources[0].crs,
            "driver": "GTiff",
            "dtype": pixels.dtype,
            "height": pixels.shape[1],
            "nodata": 0,
            "transform": transform,
            "width": pixels.shape[2],
        }
        with MemoryFile() as memory:
            with memory.open(**profile) as mosaic:
                mosaic.write(pixels)
                yield mosaic
    finally:
        for source in sources:
            source.close()


@contextmanager
def open_4326(path: Path) -> Generator[rasterio.io.DatasetReader, None, None]:
    """Open a raster, reprojecting to EPSG:4326 on the fly if needed."""
    with rasterio.open(path) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() == 4326:
            yield dataset
            return
        with WarpedVRT(dataset, crs="EPSG:4326", resampling=Resampling.nearest) as vrt:
            yield vrt


def grid_rows(
    connection: psycopg.Connection,
    year: int,
    source: str,
    area_kode: str | None = None,
) -> list[tuple[int, dict]]:
    """Select pending grids intersecting a region boundary.

    With an `area_kode` the region is that single Kabupaten/Kota; without it,
    the region is the merged Malang Raya union of Kabupaten and Kota Malang.
    """
    with connection.cursor() as cursor:
        if area_kode:
            query = """
                SELECT grid.id, ST_AsGeoJSON(grid.geom)::jsonb
                FROM grid
                CROSS JOIN kabkota
                WHERE kabkota."KDPKAB" = %s
                  AND ST_Intersects(grid.geom, kabkota.geometry)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM landcover
                    WHERE landcover.grid_id = grid.id
                      AND landcover.year = %s
                      AND landcover.source = %s
                      AND landcover.area = %s
                  )
            """
            params = (area_kode, year, source, area_kode)
        else:
            query = """
                SELECT grid.id, ST_AsGeoJSON(grid.geom)::jsonb
                FROM grid
                CROSS JOIN (
                  SELECT ST_UnaryUnion(ST_Collect(geometry)) AS geom
                  FROM kabkota
                  WHERE "KDPKAB" IN ('35.07', '35.73')
                ) AS malang
                WHERE ST_Intersects(grid.geom, malang.geom)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM landcover
                    WHERE landcover.grid_id = grid.id
                      AND landcover.year = %s
                      AND landcover.source = %s
                  )
            """
            params = (year, source)
        cursor.execute(query, params)
        return [(grid_id, geometry) for grid_id, geometry in cursor.fetchall()]


def insert_features(
    connection: psycopg.Connection,
    grid_id: int,
    year: int,
    source: str,
    methodology: str,
    features: Iterable[tuple[int, str]],
    area: str | None = None,
) -> int:
    rows = [
        (grid_id, year, source, methodology, class_code, geometry, area, grid_id)
        for class_code, geometry in features
    ]
    if not rows:
        return 0
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO landcover (grid_id, year, source, methodology, class_code, geom, area)
            SELECT
              %s,
              %s,
              %s,
              %s,
              %s,
              ST_Multi(
                ST_CollectionExtract(
                  ST_Intersection(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), grid.geom),
                  3
                )
              ),
              %s
            FROM grid
            WHERE grid.id = %s
            """,
            rows,
        )
    return len(rows)


def vectorize_grid(
    geometry: dict,
    dataset: rasterio.io.DatasetReader,
) -> Iterable[tuple[int, str]]:
    pixels, transform = mask(dataset, [geometry], crop=True, filled=False)
    values = pixels[0]
    valid = ~values.mask
    for shape, class_code in shapes(values.filled(0), mask=valid, transform=transform):
        yield int(class_code), json.dumps(shape, separators=(",", ":"))


def process_year(
    connection: psycopg.Connection,
    input_dir: Path,
    year: int,
    source: str,
    methodology: str,
    limit: int | None,
    areas: Sequence[str] | None = None,
) -> None:
    if source == "malang-landcover":
        for area, raster_path in malang_area_rasters(input_dir, year).items():
            area_kode = AREA_KODES[area]
            grids = grid_rows(connection, year, source, area_kode=area_kode)
            if limit is not None:
                grids = grids[:limit]
            print(
                f"{year} {area} (area {area_kode}): {len(grids)} grids pending, raster {raster_path.name}",
                flush=True,
            )
            with open_4326(raster_path) as dataset:
                for index, (grid_id, geometry) in enumerate(grids, start=1):
                    with connection.transaction():
                        count = insert_features(
                            connection,
                            grid_id,
                            year,
                            source,
                            methodology,
                            vectorize_grid(geometry, dataset),
                            area=area_kode,
                        )
                    print(
                        f"{year} {area}: grid {grid_id} ({index}/{len(grids)}), {count} features",
                        flush=True,
                    )
        return

    tiles = load_tiles(input_dir, year)
    grids = grid_rows(connection, year, source)
    if limit is not None:
        grids = grids[:limit]
    print(f"{year}: {len(grids)} grids pending across {len(tiles)} raster tiles", flush=True)
    with open_mosaic(tiles) as mosaic:
        for index, (grid_id, geometry) in enumerate(grids, start=1):
            with connection.transaction():
                count = insert_features(
                    connection,
                    grid_id,
                    year,
                    source,
                    methodology,
                    vectorize_grid(geometry, mosaic),
                )
            print(f"{year}: grid {grid_id} ({index}/{len(grids)}), {count} features", flush=True)


def ensure_landcover_view(connection: psycopg.Connection, year: int) -> None:
    """(Re)create the vector-tile view for a malang-landcover year."""
    if not 1900 <= year <= 2100:
        raise ValueError(f"Invalid landcover year: {year}")
    with connection.transaction(), connection.cursor() as cursor:
        cursor.execute(
            f"""
            CREATE OR REPLACE VIEW landcover_{year} AS
            SELECT id, grid_id, year, class_code, area, geom
            FROM landcover
            WHERE year = {year} AND source = 'malang-landcover'
            """
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, nargs="+", default=None, help="Years to process; defaults to all years found in the input directory")
    parser.add_argument("--input", type=Path, default=Path("data/imagery/malang-data"))
    parser.add_argument("--source", default=SOURCE)
    parser.add_argument("--methodology", default=METHODOLOGY)
    parser.add_argument("--limit", type=int, help="Process at most this many pending grids per area/year")
    parser.add_argument("--replace", action="store_true", help="Delete existing rows for the selected source and years first")
    args = parser.parse_args()

    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required. Add it to .env or export it in your shell.")

    if args.years is None:
        args.years = discover_malang_years(args.input)
    if not args.years:
        raise SystemExit(f"No raster years found under {args.input}")

    with psycopg.connect(database_url) as connection:
        if args.replace:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM landcover WHERE source = %s AND year = ANY(%s)",
                    (args.source, args.years),
                )
        for year in args.years:
            process_year(connection, args.input, year, args.source, args.methodology, args.limit)
            if args.source == "malang-landcover":
                ensure_landcover_view(connection, year)
                print(f"{year}: landcover_{year} view (re)created", flush=True)


if __name__ == "__main__":
    main()
