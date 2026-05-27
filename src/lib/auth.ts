import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { cookies } from 'next/headers';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DEVICES = 2;
const PBKDF2_ITERATIONS = 100000;

// Web Crypto API based password hashing (Edge Runtime compatible)
// Fast SHA-256 hash for session tokens (high entropy, no need for slow hash)
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  const computed = await hashToken(token);
  return computed === storedHash;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2:')) {
    const [, iterations, saltHex, hashHex] = stored.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: parseInt(iterations), hash: 'SHA-256' },
      keyMaterial, 256
    );
    const computedHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHex === hashHex;
  }

  // Legacy bcrypt format - cannot verify on Edge Runtime
  // Password needs to be migrated via /api/admin/migrate-passwords
  return false;
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

  // Check device limit
  if (deviceInfo && deviceInfo.fingerprint) {
    const existing = await db.execute({
      sql: 'SELECT id, device_fingerprint FROM sessions WHERE user_id = ? AND expires_at > datetime("now") ORDER BY created_at ASC',
      args: [userId],
    });

    const sameDevice = existing.rows.find(r => r.device_fingerprint === deviceInfo.fingerprint);
    if (sameDevice) {
      await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sameDevice.id] });
    } else if (existing.rows.length >= MAX_DEVICES) {
      await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [existing.rows[0].id] });
    }
  }

  const sessionId = uuidv4();
  const token = uuidv4();
  const tokenHash = await hashToken(token);
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

  const valid = await verifyToken(token, session.token_hash as string);
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
