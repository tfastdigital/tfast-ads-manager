/**
 * Minimal migration runner: applies server/src/db/migrations/*.pgsql in
 * filename order, tracking applied files in schema_migrations.
 * Run: npm run migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.pgsql')).sort();
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.exec(sql); // migrations are multi-statement
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✔ migrated ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✘ failed ${file}`);
      throw err;
    } finally {
      client.release?.();
    }
  }
  console.log('Migrations up to date.');
}

// ESM entrypoint guard
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
