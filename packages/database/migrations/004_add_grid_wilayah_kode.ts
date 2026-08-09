import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE grid ADD COLUMN wilayah_kode VARCHAR(13)`.execute(db);
  await sql`CREATE INDEX grid_wilayah_kode_idx ON grid (wilayah_kode)`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS grid_wilayah_kode_idx`.execute(db);
  await sql`ALTER TABLE grid DROP COLUMN IF EXISTS wilayah_kode`.execute(db);
}
