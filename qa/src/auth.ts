import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from './db.js';

export async function createUser(email: string, password: string, name?: string) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
    [email, hash, name || null]
  );
  return rows[0].id;
}

export async function verifyPassword(email: string, password: string) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0]) return null;
  const valid = await bcrypt.compare(password, rows[0].password_hash);
  return valid ? rows[0] : null;
}

export async function createSession(userId: number): Promise<string> {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600_000);
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expires]);
  return id;
}

export async function getSession(sessionId: string) {
  const { rows } = await query(
    'SELECT s.*, u.email, u.name, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = $1 AND s.expires_at > NOW()',
    [sessionId]
  );
  return rows[0] || null;
}
