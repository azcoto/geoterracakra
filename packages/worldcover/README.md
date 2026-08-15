# WorldCover / land cover pipeline

Two land cover datasets can be vectorized into the PostGIS `landcover` table:

| Source label        | Directory                        | Years                              | CRS        | Classes        |
| ------------------- | -------------------------------- | ---------------------------------- | ---------- | -------------- |
| `malang-landcover`  | `data/imagery/malang-data/`      | any folder present under it (2024) | EPSG:4326   | 0, 1, 2, 3     |
| `esri-landcover`    | `data/imagery/esri-worldcover/`  | 2020, 2021, 2022, 2023, 2025       | EPSG:4326   | 1, 2, 4, 5, 7, 8, 9, 10, 11 |

`malang-landcover` is the default source used by the app. Each area is stored
separately: `data/imagery/malang-data/<year>/LandCover_Kab_Malang_<year>.tif`
maps to Kabupaten Malang (`35.07`) and `LandCover_Kota_Malang_<year>.tif`
maps to Kota Malang (`35.73`). The raster nodata value is masked out as no data.

## Fetch Esri annual tiles (optional)

Downloads the Esri/Impact Observatory 10 m annual LULC collection from Earth
Engine for the bounding box of Kabupaten Malang, which also covers Kota Malang.
The collection is available for 2017–2025.

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/fetch.py
```

The GeoTIFF tiles are saved under `data/imagery/esri-worldcover/<year>/`.

## Vectorize into PostGIS

The vectorizer selects every grid that spatially intersects the target area
boundary, clips the raster to that grid cell, groups connected pixels by class,
and inserts the resulting multipolygons into `landcover`.

Default run (Malang data, all years found under `data/imagery/malang-data`):

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/vectorize.py
```

To restrict to a single year:

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/vectorize.py --years 2024
```

Each imported Malang year also (re)creates its `landcover_<year>` vector-tile
view. Use `--limit 1` to validate a small batch, or `--replace` to delete
existing rows for the selected source and years before importing.

To (re)import the Esri tiles instead:

```sh
uv run --project packages/worldcover python packages/worldcover/src/worldcover/vectorize.py \
  --input data/imagery/esri-worldcover \
  --years 2020 2021 2022 2023 2025 \
  --source esri-landcover
```

## Malang land cover class legend

| Code | Meaning      | Suggested color |
| ---- | ------------ | --------------- |
| 0    | Vegetation   | green           |
| 1    | Water        | blue            |
| 2    | Built-up     | red             |
| 3    | Open land    | yellow          |

## Area separation in the app

`malang-landcover` rows carry an `area` column with the Kemendagri
Kabupaten/Kota code (`35.07` or `35.73`). The `landcover_<year>` views expose
it as a tile property, and the frontend filters both the boundary line and the
landcover fill by the selected area. `grid` cells already carry `wilayah_kode`,
whose first five characters identify the area.
