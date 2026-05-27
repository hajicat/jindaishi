import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession } from '@/lib/auth';

export const runtime = 'edge';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;

    if (sessionId) {
      await destroySession(sessionId);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete('session_id');
    response.cookies.delete('session_token');
    return response;
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
