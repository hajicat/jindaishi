import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getDb();

  // Get each user's best exam result
  const result = await db.execute(`
    SELECT u.id, u.username, u.real_name, u.class_name,
           e.score, e.total, e.single_correct, e.single_total,
           e.multi_correct, e.multi_total, e.tf_correct, e.tf_total,
           e.created_at as exam_date,
           e2.exam_count
    FROM users u
    LEFT JOIN (
      SELECT user_id, MAX(score) as max_score
      FROM exam_results
      GROUP BY user_id
    ) best ON u.id = best.user_id
    LEFT JOIN exam_results e ON best.user_id = e.user_id AND best.max_score = e.score
    LEFT JOIN (
      SELECT user_id, COUNT(*) as exam_count
      FROM exam_results
      GROUP BY user_id
    ) e2 ON u.id = e2.user_id
    WHERE u.role = 'student' AND u.status = 'active'
    ORDER BY e.score DESC
  `);

  const leaderboard = result.rows.map(row => ({
    id: row.id as string,
    username: row.username as string,
    realName: row.real_name as string || row.username as string,
    className: row.class_name as string || '',
    bestScore: (row.score as number) || 0,
    total: (row.total as number) || 80,
    singleCorrect: (row.single_correct as number) || 0,
    singleTotal: (row.single_total as number) || 40,
    multiCorrect: (row.multi_correct as number) || 0,
    multiTotal: (row.multi_total as number) || 20,
    tfCorrect: (row.tf_correct as number) || 0,
    tfTotal: (row.tf_total as number) || 20,
    examCount: (row.exam_count as number) || 0,
    examDate: (row.exam_date as string) || '',
  }));

  return NextResponse.json(leaderboard);
}
