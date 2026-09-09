import fs from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const sql = await fs.readFile(new URL('../db-schema.sql', import.meta.url), 'utf8');
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('[migrate] PostgreSQL schema is up to date.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[migrate] failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
