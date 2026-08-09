import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE wilayah (
      kode VARCHAR(13) PRIMARY KEY,
      nama TEXT NOT NULL,
      administrative_level TEXT GENERATED ALWAYS AS (
        CASE char_length(kode)
          WHEN 2 THEN 'provinsi'
          WHEN 5 THEN 'kabupaten_kota'
          WHEN 8 THEN 'kecamatan'
          WHEN 13 THEN 'desa_kelurahan'
        END
      ) STORED,
      CONSTRAINT wilayah_kode_level_check CHECK (char_length(kode) IN (2, 5, 8, 13))
    )
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS wilayah`.execute(db);
}
