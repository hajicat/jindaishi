import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

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

  const { mastered, mistakes, stats } = await req.json();
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
