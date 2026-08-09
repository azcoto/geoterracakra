import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE landcover (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      grid_id BIGINT NOT NULL REFERENCES grid (id) ON DELETE RESTRICT,
      year SMALLINT NOT NULL CHECK (year BETWEEN 1900 AND 2100),
      source TEXT NOT NULL,
      methodology TEXT NOT NULL,
      class_code SMALLINT NOT NULL,
      geom geometry(MultiPolygon, 4326) NOT NULL
    )
  `.execute(db);

  await sql`CREATE INDEX landcover_grid_year_idx ON landcover (grid_id, year)`.execute(db);
  await sql`CREATE INDEX landcover_year_source_idx ON landcover (year, source)`.execute(db);
  await sql`CREATE INDEX landcover_geom_gix ON landcover USING GIST (geom)`.execute(db);
  await sql`COMMENT ON COLUMN landcover.source IS 'Dataset identifier, for example esri-landcover'`.execute(db);
  await sql`COMMENT ON COLUMN landcover.methodology IS 'Classification methodology, for example proprietary'`.execute(db);
  await sql`COMMENT ON COLUMN landcover.class_code IS 'Source landcover class value retained during vectorization'`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS landcover`.execute(db);
}
