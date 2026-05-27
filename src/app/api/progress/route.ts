import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

// Max payload size: 500KB (progress data should never be this large)
const MAX_PAYLOAD_SIZE = 500 * 1024;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM progress WHERE user_id = ?',
    args: [user.id],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ mastered: {}, mistakes: {}, stats: {} });
  }

  const row = result.rows[0];
  return NextResponse.json({
    mastered: JSON.parse(row.mastered_json as string || '{}'),
    mistakes: JSON.parse(row.mistakes_json as string || '{}'),
    stats: JSON.parse(row.stats_json as string || '{}'),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // Check content length
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return NextResponse.json({ error: '数据过大' }, { status: 413 });
  }

  let body: { mastered?: unknown; mistakes?: unknown; stats?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { mastered, mistakes, stats } = body;

  // Validate data types - must be plain objects or null/undefined
  if (mastered !== undefined && mastered !== null && (typeof mastered !== 'object' || Array.isArray(mastered))) {
    return NextResponse.json({ error: 'mastered 数据格式错误' }, { status: 400 });
  }
  if (mistakes !== undefined && mistakes !== null && (typeof mistakes !== 'object' || Array.isArray(mistakes))) {
    return NextResponse.json({ error: 'mistakes 数据格式错误' }, { status: 400 });
  }
  if (stats !== undefined && stats !== null && (typeof stats !== 'object' || Array.isArray(stats))) {
    return NextResponse.json({ error: 'stats 数据格式错误' }, { status: 400 });
  }

  // Validate mistakes values are numbers
  if (mistakes && typeof mistakes === 'object') {
    for (const [key, val] of Object.entries(mistakes as Record<string, unknown>)) {
      if (typeof key !== 'string' || key.length > 20) {
        return NextResponse.json({ error: 'mistakes key 格式错误' }, { status: 400 });
      }
      if (typeof val !== 'number' || val < 0 || val > 10000) {
        return NextResponse.json({ error: 'mistakes value 格式错误' }, { status: 400 });
      }
    }
  }

  // Validate mastered values are boolean
  if (mastered && typeof mastered === 'object') {
    for (const [key, val] of Object.entries(mastered as Record<string, unknown>)) {
      if (typeof key !== 'string' || key.length > 20) {
        return NextResponse.json({ error: 'mastered key 格式错误' }, { status: 400 });
      }
      if (val !== true) {
        return NextResponse.json({ error: 'mastered value 格式错误' }, { status: 400 });
      }
    }
  }

  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO progress (user_id, mastered_json, mistakes_json, stats_json, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            mastered_json = excluded.mastered_json,
            mistakes_json = excluded.mistakes_json,
            stats_json = excluded.stats_json,
            updated_at = excluded.updated_at`,
    args: [
      user.id,
      JSON.stringify(mastered || {}),
      JSON.stringify(mistakes || {}),
      JSON.stringify(stats || {}),
      now,
    ],
  });

  return NextResponse.json({ ok: true });
}
