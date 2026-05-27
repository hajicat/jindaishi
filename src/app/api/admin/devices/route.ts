import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

// GET: 查看某个用户的所有设备
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });

  const db = getDb();

  // Ensure columns exist
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT DEFAULT ''`);
    await db.execute(`ALTER TABLE sessions ADD COLUMN device_name TEXT DEFAULT ''`);
  } catch {}

  const result = await db.execute({
    sql: `SELECT s.id, s.device_name, s.device_fingerprint, s.created_at, s.expires_at,
           u.username, u.real_name
          FROM sessions s
          JOIN users u ON s.user_id = u.id
          WHERE s.user_id = ? AND datetime(s.expires_at) > datetime('now')
          ORDER BY s.created_at DESC`,
    args: [userId],
  });

  return NextResponse.json(result.rows);
}

// DELETE: 解绑指定设备（删除 session）
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 });
  }

  const db = getDb();
  await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [body.sessionId] });

  return NextResponse.json({ ok: true });
}
