import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS grid_administrative_idx`.execute(db);
  await sql`ALTER TABLE grid RENAME COLUMN kodepodes TO bps_kode`.execute(db);
  await sql`
    ALTER TABLE grid
      DROP COLUMN kodeprov,
      DROP COLUMN kodekabkot,
      DROP COLUMN kodekec,
      DROP COLUMN provinsi,
      DROP COLUMN kabkot,
      DROP COLUMN kecamatan,
      DROP COLUMN desa
  `.execute(db);
  await sql`CREATE INDEX grid_bps_kode_idx ON grid (bps_kode)`.execute(db);
  await sql`COMMENT ON COLUMN grid.wilayah_kode IS 'Kemendagri Desa/Kelurahan code, resolved from the BPS code relation'`.execute(db);
  await sql`COMMENT ON COLUMN grid.bps_kode IS 'Source BPS Desa/Kelurahan code retained for unmapped legacy records'`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS grid_bps_kode_idx`.execute(db);
  await sql`ALTER TABLE grid RENAME COLUMN bps_kode TO kodepodes`.execute(db);
  await sql`
    ALTER TABLE grid
      ADD COLUMN kodeprov VARCHAR(2),
      ADD COLUMN kodekabkot VARCHAR(2),
      ADD COLUMN kodekec VARCHAR(7),
      ADD COLUMN provinsi TEXT,
      ADD COLUMN kabkot TEXT,
      ADD COLUMN kecamatan TEXT,
      ADD COLUMN desa TEXT
  `.execute(db);
}
