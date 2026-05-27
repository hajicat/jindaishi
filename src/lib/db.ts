import { createClient } from '@libsql/client';

let db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error('TURSO_DATABASE_URL is not set');
    db = createClient({ url, authToken: token });
  }
  return db;
}
