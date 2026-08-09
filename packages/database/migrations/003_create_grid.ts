import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE grid (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      geom geometry(MultiPolygon, 4326) NOT NULL,
      kodepodes VARCHAR(10) NOT NULL,
      kodeprov VARCHAR(2) NOT NULL,
      kodekabkot VARCHAR(2) NOT NULL,
      kodekec VARCHAR(7) NOT NULL,
      provinsi TEXT NOT NULL,
      kabkot TEXT NOT NULL,
      kecamatan TEXT NOT NULL,
      desa TEXT NOT NULL
    )
  `.execute(db);

  await sql`CREATE INDEX grid_geom_gix ON grid USING GIST (geom)`.execute(db);
  await sql`CREATE INDEX grid_administrative_idx ON grid (kodeprov, kodekabkot, kodekec, kodepodes)`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS grid`.execute(db);
}
