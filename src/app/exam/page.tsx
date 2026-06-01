'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import quizData from '@/lib/quiz-data.json';
import { Suspense } from 'react';

interface Question {
  id: string;
  type: 'single' | 'multi' | 'tf';
  q: string;
  options?: string[];
  a: string;
  diff: string;
}

const singlePool = quizData.filter(q => q.type === 'single') as Question[];
const multiPool = quizData.filter(q => q.type === 'multi') as Question[];
const tfPool = quizData.filter(q => q.type === 'tf') as Question[];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(q: Question): Question {
  if (!q.options || q.a === 'Y' || q.a === 'N') return { ...q };
  const correctTexts = q.a.split('').map(c => q.options![c.charCodeAt(0) - 65]);
  const shuffled = shuffle(q.options!);
  const newAnswer = correctTexts
    .map(t => String.fromCharCode(65 + shuffled.indexOf(t)))
    .sort()
    .join('');
  return { ...q, options: shuffled, a: newAnswer };
}

function ExamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shadowUserId = searchParams.get('shadow');

  const [phase, setPhase] = useState<'ready' | 'exam' | 'result'>('ready');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<null | {
    score: number; total: number;
    singleCorrect: number; singleTotal: number;
    multiCorrect: number; multiTotal: number;
    tfCorrect: number; tfTotal: number;
  }>(null);
  const [timeLeft, setTimeLeft] = useState(90 * 60);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [examStart, setExamStart] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shadow state
  const [shadowName, setShadowName] = useState('');
  const [shadowTimeline, setShadowTimeline] = useState<number[]>([]); // sorted seconds per answer
  const [shadowProgress, setShadowProgress] = useState(0);

  // Check auth
  useEffect(() => {
    fetch('/api/me').then(r => { if (!r.ok) router.push('/login'); });
  }, [router]);

  // Load shadow data
  useEffect(() => {
    if (!shadowUserId) return;
    fetch(`/api/exam/shadow?userId=${shadowUserId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.timing) {
          setShadowName(data.name || '对手');
          // Convert timing map to sorted array of seconds (by answer order)
          const times = Object.values(data.timing as Record<string, number>).sort((a, b) => a - b);
          setShadowTimeline(times);
        }
      })
      .catch(() => {});
  }, [shadowUserId]);

  // Timer
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Shadow progress tracking
  useEffect(() => {
    if (phase !== 'exam' || !shadowUserId || shadowTimeline.length === 0 || examStart <= 0) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - examStart) / 1000;
      if (elapsed < 0) return;
      let count = 0;
      for (const t of shadowTimeline) {
        if (t >= 0 && t <= elapsed) count++;
      }
      setShadowProgress(count);
    }, 500);
    return () => clearInterval(interval);
  }, [phase, shadowUserId, shadowTimeline, examStart]);

  function startExam() {
    const selected = [
      ...shuffle(singlePool).slice(0, 40).map(q => shuffleOptions(q)),
      ...shuffle(multiPool).slice(0, 20).map(q => shuffleOptions(q)),
      ...shuffle(tfPool).slice(0, 20).map(q => shuffleOptions(q)),
    ];
    setQuestions(selected);
    setAnswers({});
    setAnswerTimes({});
    setCurrentIdx(0);
    setPhase('exam');
    setTimeLeft(90 * 60);
    setMultiSelected(new Set());
    setExamStart(Date.now());
    setShadowProgress(0);
  }

  function recordAnswer(qId: string, answer: string) {
    const elapsed = Math.floor((Date.now() - examStart) / 1000);
    setAnswers(prev => ({ ...prev, [qId]: answer }));
    setAnswerTimes(prev => prev[qId] ? prev : { ...prev, [qId]: elapsed });
  }

  function handleSingleAnswer(qId: string, answer: string) {
    recordAnswer(qId, answer);
  }

  function handleMultiToggle(qId: string, val: string) {
    setMultiSelected(prev => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  }

  function handleMultiSubmit(qId: string) {
    const answer = Array.from(multiSelected).sort().join('');
    recordAnswer(qId, answer);
    setMultiSelected(new Set());
  }

  async function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);
    if (timerRef.current) clearInterval(timerRef.current);

    let singleCorrect = 0, singleTotal = 0;
    let multiCorrect = 0, multiTotal = 0;
    let tfCorrect = 0, tfTotal = 0;
    const details: Record<string, { answer: string; time: number }> = {};

    questions.forEach(q => {
      const userAnswer = answers[q.id] || '';
      const isCorrect = userAnswer === q.a;
      details[q.id] = { answer: userAnswer || '未答', time: answerTimes[q.id] || 0 };

      if (q.type === 'single') { singleTotal++; if (isCorrect) singleCorrect++; }
      else if (q.type === 'multi') { multiTotal++; if (isCorrect) multiCorrect++; }
      else { tfTotal++; if (isCorrect) tfCorrect++; }
    });

    const score = singleCorrect + multiCorrect + tfCorrect;

    setResult({ score, total: 80, singleCorrect, singleTotal, multiCorrect, multiTotal, tfCorrect, tfTotal });

    await fetch('/api/exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score, total: 80,
        singleCorrect, singleTotal,
        multiCorrect, multiTotal,
        tfCorrect, tfTotal,
        details,
      }),
    });

    setPhase('result');
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;

  // ===== Ready =====
  if (phase === 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {shadowUserId ? 'PK 模式' : '仿真模拟考试'}
          </h1>
          {shadowUserId ? (
            <p className="text-gray-500 mb-6">正在加载对手数据...</p>
          ) : (
            <p className="text-gray-500 mb-6">模拟真实考试环境</p>
          )}

          <div className="bg-gray-50 rounded-lg p-4 text-left text-sm text-gray-600 space-y-2 mb-6">
            <p><strong>考试题型：</strong></p>
            <p>• 单项选择题 × 40</p>
            <p>• 多项选择题 × 20</p>
            <p>• 判断题 × 20</p>
            <p className="pt-2"><strong>考试时间：</strong>90 分钟</p>
            <p><strong>总分：</strong>80 分</p>
            {shadowUserId && shadowName && (
              <p className="text-purple-600 font-medium pt-2">
                对手：{shadowName}（影子进度条实时显示对手答题节奏）
              </p>
            )}
          </div>

          <button
            onClick={startExam}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            {shadowUserId ? '开始 PK' : '开始考试'}
          </button>
        </div>
      </div>
    );
  }

  // ===== Result =====
  if (phase === 'result' && result) {
    const percent = Math.round((result.score / result.total) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {shadowUserId ? 'PK 结束' : '考试结束'}
          </h1>

          <div className={`text-5xl font-bold mb-2 ${percent >= 60 ? 'text-green-600' : 'text-red-500'}`}>
            {result.score}/{result.total}
          </div>
          <p className="text-gray-500 mb-6">得分率 {percent}%</p>

          <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="font-bold text-blue-600">{result.singleCorrect}/{result.singleTotal}</div>
              <div className="text-gray-500">单选</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="font-bold text-purple-600">{result.multiCorrect}/{result.multiTotal}</div>
              <div className="text-gray-500">多选</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="font-bold text-orange-600">{result.tfCorrect}/{result.tfTotal}</div>
              <div className="text-gray-500">判断</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPhase('ready')} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              再考一次
            </button>
            <button onClick={() => router.push('/leaderboard')} className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              排行榜
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Exam =====
  if (!currentQ) return null;

  const isMulti = currentQ.type === 'multi';
  const isTf = currentQ.type === 'tf';
  const currentAnswer = answers[currentQ.id];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            第 <span className="font-bold">{currentIdx + 1}</span> / {questions.length} 题
            <span className="ml-3 text-gray-400">已答 {answeredCount} 题</span>
          </div>
          <div className={`text-lg font-mono font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-gray-700'}`}>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Progress bars */}
        <div className="max-w-3xl mx-auto px-4 pb-2 space-y-1">
          {/* My progress */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16">我 {answeredCount}/{questions.length}</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
            </div>
          </div>
          {/* Shadow progress - only show during exam */}
          {phase === 'exam' && shadowUserId && shadowTimeline.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-500 w-16">影子 {shadowProgress}/{questions.length}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${(shadowProgress / questions.length) * 100}%` }} />
              </div>
              <span className="text-xs text-purple-400">{shadowName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Question nav dots */}
      <div className="max-w-3xl mx-auto px-4 mt-3">
        <div className="flex flex-wrap gap-1.5 mb-4">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => { setCurrentIdx(i); setMultiSelected(new Set()); }}
              className={`w-7 h-7 rounded text-xs font-medium transition ${
                i === currentIdx ? 'bg-blue-600 text-white ring-2 ring-blue-300' :
                answers[q.id] ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Question card */}
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="mb-3">
            <span className={`text-xs px-2 py-0.5 rounded ${
              currentQ.type === 'single' ? 'bg-blue-100 text-blue-700' :
              currentQ.type === 'multi' ? 'bg-purple-100 text-purple-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              {currentQ.type === 'single' ? '单选' : currentQ.type === 'multi' ? '多选' : '判断'}
            </span>
          </div>

          <div className="font-medium text-gray-800 mb-4 text-lg">
            {currentIdx + 1}. {currentQ.q}
          </div>

          {isTf ? (
            <div className="space-y-2">
              {[
                { text: '正确 (Y)', val: 'Y' },
                { text: '错误 (N)', val: 'N' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => handleSingleAnswer(currentQ.id, opt.val)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition text-sm ${
                    currentAnswer === opt.val ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          ) : isMulti ? (
            <div className="space-y-2">
              {currentQ.options!.map((opt, i) => {
                const val = String.fromCharCode(65 + i);
                const isSelected = multiSelected.has(val) || (currentAnswer && currentAnswer.includes(val) && !multiSelected.size);
                return (
                  <button
                    key={val}
                    onClick={() => { if (!currentAnswer) handleMultiToggle(currentQ.id, val); }}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition text-sm ${
                      isSelected ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {val}. {opt}
                  </button>
                );
              })}
              {!currentAnswer && (
                <button
                  onClick={() => handleMultiSubmit(currentQ.id)}
                  disabled={multiSelected.size === 0}
                  className="mt-2 bg-blue-500 text-white px-6 py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
                >
                  确认本题
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {currentQ.options!.map((opt, i) => {
                const val = String.fromCharCode(65 + i);
                return (
                  <button
                    key={val}
                    onClick={() => handleSingleAnswer(currentQ.id, val)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition text-sm ${
                      currentAnswer === val ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {val}. {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-4 mb-8">
          <button
            onClick={() => { setCurrentIdx(Math.max(0, currentIdx - 1)); setMultiSelected(new Set()); }}
            disabled={currentIdx === 0}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            上一题
          </button>

          {currentIdx < questions.length - 1 ? (
            <button
              onClick={() => { setCurrentIdx(currentIdx + 1); setMultiSelected(new Set()); }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              下一题
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              交卷
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>}>
      <ExamContent />
    </Suspense>
  );
}
