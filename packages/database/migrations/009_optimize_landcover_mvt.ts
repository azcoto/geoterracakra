import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS landcover_year_geom_area_gix 
    ON landcover USING GIST (geom) 
    INCLUDE (year, area, class_code)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS landcover_tiles_cache (
      z integer NOT NULL,
      x integer NOT NULL,
      y integer NOT NULL,
      year integer NOT NULL,
      area varchar(10) NOT NULL,
      mvt bytea,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (z, x, y, year, area)
    )
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION landcover_mvt(
      z integer,
      x integer,
      y integer,
      query_params json DEFAULT '{}'::json
    )
    RETURNS bytea AS $$
    DECLARE
      cached_mvt bytea;
      result_mvt bytea;
      bounds_4326 geometry;
      min_area double precision;
      simplify_tol double precision;
      target_year integer;
      target_area varchar;
    BEGIN
      target_year := COALESCE((query_params->>'year')::integer, 2024);
      target_area := COALESCE(query_params->>'area', 'all');

      SELECT c.mvt INTO cached_mvt
      FROM landcover_tiles_cache c
      WHERE c.z = $1
        AND c.x = $2
        AND c.y = $3
        AND c.year = target_year
        AND c.area = target_area;

      IF cached_mvt IS NOT NULL THEN
        RETURN cached_mvt;
      END IF;

bounds_4326 := ST_Transform(ST_TileEnvelope($1, $2, $3), 4326);

      IF $1 <= 9 THEN
        min_area := 0.000002;
        simplify_tol := 0.0004;
      ELSIF $1 = 10 THEN
        min_area := 0.0000005;
        simplify_tol := 0.00015;
      ELSIF $1 = 11 THEN
        min_area := 0.0000001;
        simplify_tol := 0.00005;
      ELSIF $1 = 12 THEN
        min_area := 0.00000002;
        simplify_tol := 0.00002;
      ELSE
        min_area := 0.0;
        simplify_tol := 0.0;
      END IF;

      SELECT ST_AsMVT(tile, 'landcover', 4096, 'geom')
      INTO result_mvt
      FROM (
        SELECT
          id,
          class_code,
          area,
          year,
          ST_AsMVTGeom(
            CASE
              WHEN simplify_tol > 0 THEN ST_Simplify(geom, simplify_tol)
              ELSE geom
            END,
            bounds_4326,
            4096,
            64,
            true
          ) AS geom
FROM landcover
    WHERE year = target_year
      AND source = 'malang-landcover'
      AND (target_area = 'all' OR area = target_area)
      AND geom && bounds_4326
      AND (min_area = 0.0 OR ST_Area(geom) >= min_area)
      ) AS tile
      WHERE tile.geom IS NOT NULL;

      EXECUTE 'INSERT INTO landcover_tiles_cache (z, x, y, year, area, mvt)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (z, x, y, year, area) DO UPDATE SET mvt = EXCLUDED.mvt'
  USING $1, $2, $3, target_year, target_area, result_mvt;

      RETURN result_mvt;
    END;
    $$ LANGUAGE plpgsql VOLATILE;
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS landcover_mvt(integer, integer, integer, json)`.execute(db);
  await sql`DROP TABLE IF EXISTS landcover_tiles_cache`.execute(db);
  await sql`DROP INDEX IF EXISTS landcover_year_geom_area_gix`.execute(db);
}
