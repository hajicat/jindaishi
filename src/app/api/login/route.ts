import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    // Origin check (CSRF protection)
    const origin = req.headers.get('origin');
    if (origin) {
      const host = req.headers.get('host');
      const allowed = [`https://${host}`, `http://${host}`, `https://jindaishi.pages.dev`];
      if (!allowed.includes(origin)) {
        return NextResponse.json({ error: '非法请求' }, { status: 403 });
      }
    }

    // Rate limit: 5 attempts per minute per IP
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(`login:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: '登录尝试过于频繁，请 1 分钟后再试' }, { status: 429 });
    }

    let body: { username?: string; password?: string; deviceFingerprint?: string; deviceName?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
    }

    const { username, password, deviceFingerprint, deviceName } = body;

    if (!username || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
    }

    // Input length validation
    if (typeof username !== 'string' || username.length > 50) {
      return NextResponse.json({ error: '账号格式错误' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length > 128) {
      return NextResponse.json({ error: '密码格式错误' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return NextResponse.json({ error: '账号已被禁用，请联系管理员' }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }

    const session = await createSession(user.id as string, {
      fingerprint: deviceFingerprint || '',
      name: deviceName || '',
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        className: user.class_name,
      },
    });

    response.cookies.set('session_id', session.sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(session.expiresAt),
    });

    response.cookies.set('session_token', session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(session.expiresAt),
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
