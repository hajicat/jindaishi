import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export const runtime = 'edge';

// One-time migration: convert all bcrypt passwords to PBKDF2
// Requires MIGRATION_SECRET env var to be set
// After migration, delete this endpoint
export async function POST(req: Request) {
  const secret = req.headers.get('x-migration-secret');
  const expectedSecret = process.env.MIGRATION_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = getDb();

  // Find all users with bcrypt hashes
  const result = await db.execute(
    "SELECT id, username, password_hash FROM users WHERE password_hash LIKE '$2%'"
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ message: 'No bcrypt passwords to migrate', migrated: 0 });
  }

  // We can't recover the original passwords from bcrypt hashes
  // So we'll set a temporary password for each user
  const tempPassword = 'Temp@2026';
  const newHash = await hashPassword(tempPassword);

  let migrated = 0;
  for (const row of result.rows) {
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      args: [newHash, new Date().toISOString(), row.id],
    });
    migrated++;
    console.log(`Migrated user: ${row.username}`);
  }

  return NextResponse.json({
    message: `Migrated ${migrated} users. Temp password: ${tempPassword}`,
    migrated,
    tempPassword,
  });
}
