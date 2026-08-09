import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { createDatabase } from './db.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationFolder = path.resolve(currentDirectory, '../migrations');
const db = createDatabase();

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder,
  }),
});

try {
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    console.log(`${result.migrationName}: ${result.status}`);
  }

  if (error) {
    throw error;
  }
} finally {
  await db.destroy();
}
