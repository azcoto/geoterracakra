import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../src/types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE INDEX wilayah_name_idx ON wilayah (nama)`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS wilayah_name_idx`.execute(db);
}
