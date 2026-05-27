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

// PATCH: 修改用户状态或密码
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const now = new Date().toISOString();

  if (body.action === 'toggle_status') {
    const user = await db.execute({ sql: 'SELECT status FROM users WHERE id = ?', args: [id] });
    if (user.rows.length === 0) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const newStatus = user.rows[0].status === 'active' ? 'disabled' : 'active';
    await db.execute({
      sql: 'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
      args: [newStatus, now, id],
    });

    await db.execute({
      sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [uuidv4(), admin.id, 'toggle_status', id, `${newStatus === 'active' ? '启用' : '禁用'}用户`, now],
    });

    return NextResponse.json({ ok: true, status: newStatus });
  }

  if (body.action === 'reset_password') {
    if (!body.password) return NextResponse.json({ error: '新密码不能为空' }, { status: 400 });

    const passwordHash = await hashPassword(body.password);
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      args: [passwordHash, now, id],
    });

    await db.execute({
      sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [uuidv4(), admin.id, 'reset_password', id, '重置密码', now],
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}

// DELETE: 删除用户
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({ sql: 'DELETE FROM progress WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });

  await db.execute({
    sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [uuidv4(), admin.id, 'delete_user', id, '删除用户', now],
  });

  return NextResponse.json({ ok: true });
}
