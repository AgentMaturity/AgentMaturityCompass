import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW()
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await query(sql);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Applied migration: ${file}`);
  }
}

if (process.argv[1]?.endsWith('db.ts') || process.argv[1]?.endsWith('db.js')) {
  migrate().then(() => { console.log('Migrations complete'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
