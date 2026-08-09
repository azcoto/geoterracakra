import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

const years = [2020, 2021, 2022, 2023, 2025] as const;

export async function up(db: Kysely<Database>): Promise<void> {
  for (const year of years) {
    await sql
      .raw(`
        CREATE VIEW landcover_${year} AS
        SELECT id, grid_id, year, class_code, geom
        FROM landcover
        WHERE year = ${year} AND source = 'esri-landcover'
      `)
      .execute(db);
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const year of years) {
    await sql.raw(`DROP VIEW IF EXISTS landcover_${year}`).execute(db);
  }
}
