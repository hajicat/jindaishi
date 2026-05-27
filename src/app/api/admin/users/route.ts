import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'edge';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

// GET: 列出所有用户
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const db = getDb();
  const result = await db.execute(
    'SELECT id, username, real_name, class_name, role, status, created_at, updated_at FROM users ORDER BY created_at DESC'
  );

  return NextResponse.json(result.rows);
}

// POST: 添加用户
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { username, realName, className, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
  }

  const db = getDb();

  // 检查用户名是否已存在
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username],
  });

  if (existing.rows.length > 0) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const id = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await db.execute({
    sql: 'INSERT INTO users (id, username, real_name, class_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, username, realName || '', className || '', passwordHash, 'student', 'active', now, now],
  });

  // 记录操作日志
  await db.execute({
    sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [uuidv4(), admin.id, 'add_user', id, `添加用户 ${username}`, now],
  });

  return NextResponse.json({ ok: true, id });
}
