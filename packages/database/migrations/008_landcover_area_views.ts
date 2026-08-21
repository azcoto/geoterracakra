import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE landcover ADD COLUMN area VARCHAR(5)`.execute(db);
  await sql`CREATE INDEX landcover_area_idx ON landcover (area)`.execute(db);
  await sql`COMMENT ON COLUMN landcover.area IS 'Kemendagri Kabupaten/Kota code, for example 35.07 or 35.73'`.execute(db);

  await sql`DROP VIEW IF EXISTS landcover_2020`.execute(db);
  await sql`DROP VIEW IF EXISTS landcover_2021`.execute(db);
  await sql`DROP VIEW IF EXISTS landcover_2022`.execute(db);
  await sql`DROP VIEW IF EXISTS landcover_2023`.execute(db);
  await sql`DROP VIEW IF EXISTS landcover_2025`.execute(db);

  await sql`
    CREATE VIEW landcover_2024 AS
    SELECT id, grid_id, year, class_code, area, geom
    FROM landcover
    WHERE year = 2024 AND source = 'malang-landcover'
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP VIEW IF EXISTS landcover_2024`.execute(db);
  await sql`DROP INDEX IF EXISTS landcover_area_idx`.execute(db);
  await sql`ALTER TABLE landcover DROP COLUMN IF EXISTS area`.execute(db);
  await sql`
    CREATE VIEW landcover_2020 AS
    SELECT id, grid_id, year, class_code, geom
    FROM landcover
    WHERE year = 2020 AND source = 'esri-landcover'
  `.execute(db);
  await sql`
    CREATE VIEW landcover_2021 AS
    SELECT id, grid_id, year, class_code, geom
    FROM landcover
    WHERE year = 2021 AND source = 'esri-landcover'
  `.execute(db);
  await sql`
    CREATE VIEW landcover_2022 AS
    SELECT id, grid_id, year, class_code, geom
    FROM landcover
    WHERE year = 2022 AND source = 'esri-landcover'
  `.execute(db);
  await sql`
    CREATE VIEW landcover_2023 AS
    SELECT id, grid_id, year, class_code, geom
    FROM landcover
    WHERE year = 2023 AND source = 'esri-landcover'
  `.execute(db);
  await sql`
    CREATE VIEW landcover_2025 AS
    SELECT id, grid_id, year, class_code, geom
    FROM landcover
    WHERE year = 2025 AND source = 'esri-landcover'
  `.execute(db);
}
