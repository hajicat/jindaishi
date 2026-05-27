import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

// GET: 获取某个用户的最佳考试的答题时间线（用于影子PK）
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });

  const db = getDb();

  // Get user info
  const userResult = await db.execute({
    sql: 'SELECT real_name, username FROM users WHERE id = ?',
    args: [userId],
  });
  if (userResult.rows.length === 0) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  // Get best exam result with timing data
  const examResult = await db.execute({
    sql: `SELECT details_json, score, total, created_at
          FROM exam_results
          WHERE user_id = ?
          ORDER BY score DESC, created_at DESC
          LIMIT 1`,
    args: [userId],
  });

  if (examResult.rows.length === 0) {
    return NextResponse.json({ error: '该用户暂无考试记录' }, { status: 404 });
  }

  const details = JSON.parse(examResult.rows[0].details_json as string || '{}');

  // Extract timing data: { questionId: secondsFromStart }
  const timing: Record<string, number> = {};
  for (const [qId, val] of Object.entries(details)) {
    if (val && typeof val === 'object' && 'time' in (val as Record<string, unknown>)) {
      timing[qId] = (val as { time: number }).time;
    }
  }

  return NextResponse.json({
    name: userResult.rows[0].real_name || userResult.rows[0].username,
    score: examResult.rows[0].score,
    total: examResult.rows[0].total,
    timing,
    examDate: examResult.rows[0].created_at,
  });
}
