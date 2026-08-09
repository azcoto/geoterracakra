# WorldCover fetcher

Downloads the Esri/Impact Observatory 10 m annual LULC collection from Earth
Engine for the bounding box of Kabupaten Malang, which also covers Kota Malang.

The collection is available for 2017–2025; the default fetches 2020–2023 and
2025, matching the years exposed in the application.

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/fetch.py
```

The GeoTIFF tiles are saved under `data/imagery/esri-worldcover/<year>/`.

## Vectorize into PostGIS

The vectorizer selects every grid that spatially intersects the Kota/Kabupaten
Malang boundary, clips each raster to that grid cell, groups connected pixels
by Esri class, and inserts the resulting multipolygons into `landcover`. It is
safe to re-run: grids that already have rows for that year and source are
skipped.

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/vectorize.py
```

Use `--limit 1` to validate a small batch, or `--replace` to replace previously
imported rows for the chosen years and source.
