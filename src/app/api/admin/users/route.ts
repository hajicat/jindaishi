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

  let body: { username?: string; realName?: string; className?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { username, realName, className, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
  }

  // Input validation
  if (typeof username !== 'string' || username.length < 2 || username.length > 50) {
    return NextResponse.json({ error: '用户名长度 2-50 个字符' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: '密码长度 6-128 个字符' }, { status: 400 });
  }
  if (realName && (typeof realName !== 'string' || realName.length > 50)) {
    return NextResponse.json({ error: '姓名最长 50 个字符' }, { status: 400 });
  }
  if (className && (typeof className !== 'string' || className.length > 50)) {
    return NextResponse.json({ error: '班级名最长 50 个字符' }, { status: 400 });
  }
  // Username: alphanumeric, digits, underscore, dash only
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: '用户名只能包含字母、数字、下划线和横线' }, { status: 400 });
  }

  const db = getDb();

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

  await db.execute({
    sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [uuidv4(), admin.id, 'add_user', id, `添加用户 ${username}`, now],
  });

  return NextResponse.json({ ok: true, id });
}
