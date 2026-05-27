import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'edge';

// POST: 提交考试成绩
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  let body: {
    score?: number;
    total?: number;
    singleCorrect?: number;
    singleTotal?: number;
    multiCorrect?: number;
    multiTotal?: number;
    tfCorrect?: number;
    tfTotal?: number;
    details?: Record<string, string>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { score, total, singleCorrect, singleTotal, multiCorrect, multiTotal, tfCorrect, tfTotal, details } = body;

  if (typeof score !== 'number' || typeof total !== 'number' || total !== 80) {
    return NextResponse.json({ error: '成绩数据格式错误' }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO exam_results (id, user_id, score, total, single_correct, single_total, multi_correct, multi_total, tf_correct, tf_total, details_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, user.id, score, total,
      singleCorrect || 0, singleTotal || 40,
      multiCorrect || 0, multiTotal || 20,
      tfCorrect || 0, tfTotal || 20,
      JSON.stringify(details || {}),
      now,
    ],
  });

  return NextResponse.json({ ok: true, id, score, total });
}

// GET: 获取自己的考试历史
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, score, total, single_correct, single_total, multi_correct, multi_total, tf_correct, tf_total, created_at FROM exam_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    args: [user.id],
  });

  return NextResponse.json(result.rows);
}
