#!/usr/bin/env python3
"""Vectorize downloaded Esri landcover pixels into the per-grid PostGIS table."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Generator, Iterable
from contextlib import contextmanager
from pathlib import Path

import psycopg
import rasterio
from rasterio.features import shapes
from rasterio.io import MemoryFile
from rasterio.mask import mask
from rasterio.merge import merge

DEFAULT_YEARS = (2020, 2021, 2022, 2023, 2025)
SOURCE = "esri-landcover"
METHODOLOGY = "proprietary"


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


def grid_rows(connection: psycopg.Connection, year: int, source: str) -> list[tuple[int, dict]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT grid.id, ST_AsGeoJSON(grid.geom)::jsonb
            FROM grid
            CROSS JOIN (
              SELECT ST_UnaryUnion(ST_Collect(geometry)) AS geom
              FROM kabkota
              WHERE "KDPKAB" IN ('35.07', '35.73')
            ) AS malang
            WHERE
              ST_Intersects(grid.geom, malang.geom)
              AND NOT EXISTS (
                SELECT 1
                FROM landcover
                WHERE landcover.grid_id = grid.id
                  AND landcover.year = %s
                  AND landcover.source = %s
              )
            """,
            (year, source),
        )
        return [(grid_id, geometry) for grid_id, geometry in cursor.fetchall()]


def insert_features(
    connection: psycopg.Connection,
    grid_id: int,
    year: int,
    source: str,
    methodology: str,
    features: Iterable[tuple[int, str]],
) -> int:
    rows = [(grid_id, year, source, methodology, class_code, geometry, grid_id) for class_code, geometry in features]
    if not rows:
        return 0
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO landcover (grid_id, year, source, methodology, class_code, geom)
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
              )
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
) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, nargs="+", default=list(DEFAULT_YEARS))
    parser.add_argument("--input", type=Path, default=Path("data/imagery/esri-worldcover"))
    parser.add_argument("--source", default=SOURCE)
    parser.add_argument("--methodology", default=METHODOLOGY)
    parser.add_argument("--limit", type=int, help="Process at most this many pending grids per year")
    parser.add_argument("--replace", action="store_true", help="Delete existing rows for the selected source and years first")
    args = parser.parse_args()

    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required. Add it to .env or export it in your shell.")

    with psycopg.connect(database_url) as connection:
        if args.replace:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM landcover WHERE source = %s AND year = ANY(%s)",
                    (args.source, args.years),
                )
        for year in args.years:
            process_year(connection, args.input, year, args.source, args.methodology, args.limit)


if __name__ == "__main__":
    main()
