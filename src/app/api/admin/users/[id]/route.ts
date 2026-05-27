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

  let body: { action?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Get target user
  const targetResult = await db.execute({ sql: 'SELECT id, role, status FROM users WHERE id = ?', args: [id] });
  if (targetResult.rows.length === 0) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }
  const target = targetResult.rows[0];

  // Prevent admin from modifying other admins
  if (target.role === 'admin' && admin.id !== id) {
    return NextResponse.json({ error: '不能操作其他管理员账号' }, { status: 403 });
  }

  if (body.action === 'toggle_status') {
    // Prevent self-disable
    if (admin.id === id) {
      return NextResponse.json({ error: '不能禁用自己的账号' }, { status: 403 });
    }

    const newStatus = target.status === 'active' ? 'disabled' : 'active';
    await db.execute({
      sql: 'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
      args: [newStatus, now, id],
    });

    // If disabling, invalidate all sessions
    if (newStatus === 'disabled') {
      await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
    }

    await db.execute({
      sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [uuidv4(), admin.id, 'toggle_status', id, `${newStatus === 'active' ? '启用' : '禁用'}用户`, now],
    });

    return NextResponse.json({ ok: true, status: newStatus });
  }

  if (body.action === 'reset_password') {
    if (!body.password || typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) {
      return NextResponse.json({ error: '密码长度 6-128 个字符' }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.password);
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      args: [passwordHash, now, id],
    });

    // Invalidate all sessions for this user (force re-login)
    await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });

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

  // Prevent self-deletion
  if (admin.id === id) {
    return NextResponse.json({ error: '不能删除自己的账号' }, { status: 403 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Check target role - prevent deleting admins
  const targetResult = await db.execute({ sql: 'SELECT role FROM users WHERE id = ?', args: [id] });
  if (targetResult.rows.length === 0) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }
  if (targetResult.rows[0].role === 'admin') {
    return NextResponse.json({ error: '不能删除管理员账号' }, { status: 403 });
  }

  await db.execute({ sql: 'DELETE FROM progress WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM exam_results WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });

  await db.execute({
    sql: 'INSERT INTO admin_logs (id, admin_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [uuidv4(), admin.id, 'delete_user', id, '删除用户', now],
  });

  return NextResponse.json({ ok: true });
}
