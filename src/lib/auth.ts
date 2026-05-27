import { hash, compare } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { cookies } from 'next/headers';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DEVICES = 2;

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(password: string, hashed: string) {
  return compare(password, hashed);
}

export async function createSession(userId: string, deviceInfo?: { fingerprint: string; name: string }) {
  const db = getDb();

  // Ensure device columns exist (migration)
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT DEFAULT ''`);
    await db.execute(`ALTER TABLE sessions ADD COLUMN device_name TEXT DEFAULT ''`);
  } catch {
    // Columns already exist, ignore
  }

  // Check device limit if device info provided
  if (deviceInfo) {
    const existing = await db.execute({
      sql: 'SELECT id, device_fingerprint FROM sessions WHERE user_id = ? AND expires_at > datetime("now") ORDER BY created_at ASC',
      args: [userId],
    });

    // Check if this device already has a session
    const sameDevice = existing.rows.find(r => r.device_fingerprint === deviceInfo.fingerprint);
    if (sameDevice) {
      // Reuse existing session for same device - delete old one
      await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sameDevice.id] });
    } else if (existing.rows.length >= MAX_DEVICES) {
      // Too many devices - delete the oldest session
      await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [existing.rows[0].id] });
    }
  }

  const sessionId = uuidv4();
  const token = uuidv4();
  const tokenHash = await hash(token, 6);
  const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();

  await db.execute({
    sql: 'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, device_fingerprint, device_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [sessionId, userId, tokenHash, expiresAt, new Date().toISOString(), deviceInfo?.fingerprint || '', deviceInfo?.name || ''],
  });

  return { sessionId, token, expiresAt };
}

export async function validateSession(sessionId: string, token: string) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT s.*, u.id as uid, u.username, u.real_name, u.role, u.status, u.class_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ?',
    args: [sessionId],
  });

  if (result.rows.length === 0) return null;

  const session = result.rows[0];
  if (new Date(session.expires_at as string) < new Date()) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
    return null;
  }

  if (session.status !== 'active') return null;

  const valid = await compare(token, session.token_hash as string);
  if (!valid) return null;

  return {
    id: session.uid as string,
    username: session.username as string,
    realName: session.real_name as string,
    role: session.role as string,
    className: session.class_name as string,
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const token = cookieStore.get('session_token')?.value;

  if (!sessionId || !token) return null;
  return validateSession(sessionId, token);
}

export async function destroySession(sessionId: string) {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
}
