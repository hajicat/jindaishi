import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'edge';

const TOTAL_QUESTIONS = 516;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getDb();

  // Join users + progress, exclude admins
  const result = await db.execute(`
    SELECT u.id, u.username, u.real_name, u.class_name,
           p.mastered_json, p.mistakes_json, p.updated_at
    FROM users u
    LEFT JOIN progress p ON u.id = p.user_id
    WHERE u.role = 'student' AND u.status = 'active'
  `);

  const leaderboard = result.rows.map(row => {
    const mastered = JSON.parse(row.mastered_json as string || '{}');
    const mistakes = JSON.parse(row.mistakes_json as string || '{}');
    const masteredCount = Object.keys(mastered).length;
    const totalErrors = Object.values(mistakes as Record<string, number>).reduce((sum, v) => sum + v, 0);
    const total = masteredCount + totalErrors;
    const accuracy = total > 0 ? Math.round((masteredCount / total) * 10000) / 100 : 0;
    const mastery = Math.round((masteredCount / TOTAL_QUESTIONS) * 10000) / 100;

    return {
      id: row.id as string,
      username: row.username as string,
      realName: row.real_name as string || row.username as string,
      className: row.class_name as string || '',
      masteredCount,
      totalErrors,
      accuracy,
      mastery,
      totalQuestions: TOTAL_QUESTIONS,
      updatedAt: row.updated_at as string || '',
    };
  });

  return NextResponse.json(leaderboard);
}
