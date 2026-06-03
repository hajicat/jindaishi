'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import banksData from '@/lib/quiz-banks.json';

interface Question {
  id: string;
  type: 'single' | 'multi' | 'tf' | 'essay';
  q: string;
  options?: string[];
  a: string;
  diff: string;
  bank?: string;
}

interface UserInfo {
  id: string;
  username: string;
  realName: string;
  role: string;
}

type Mode = 'full' | 'drill-single' | 'drill-multi' | 'drill-tf' | 'strategy';
type BankKey = 'formal' | 'knowledge';

const bankKeys = Object.keys(banksData) as BankKey[];

function getBankQuestions(bankKey: BankKey) {
  const bank = banksData[bankKey];
  const empty: Question[] = [];
  if (!bank) return { single: empty, multi: empty, tf: empty, all: empty, allChoice: empty };
  const questions = bank.questions as Question[];
  const single: Question[] = questions.filter(q => q.type === 'single');
  const multi: Question[] = questions.filter(q => q.type === 'multi');
  const tf: Question[] = questions.filter(q => q.type === 'tf');
  return { single, multi, tf, all: questions, allChoice: [...single, ...multi, ...tf] };
}

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

export default function QuizPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankKey, setBankKey] = useState<BankKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exam_active_bank') as BankKey;
      if (saved && bankKeys.includes(saved)) return saved;
    }
    return 'formal';
  });
  const bankData = getBankQuestions(bankKey);
  const singleData: Question[] = bankData.single;
  const multiData: Question[] = bankData.multi;
  const tfData: Question[] = bankData.tf;
  const allQuestions: Question[] = bankData.all;
  const allChoiceQuestions: Question[] = bankData.allChoice;

  const [mode, setMode] = useState<Mode>('full');
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [errorCounts, setErrorCounts] = useState<Record<string, number>>({});
  const [isReviewMode, setIsReviewMode] = useState(false);

  // Full mode state
  const [fullQuestions, setFullQuestions] = useState<Question[]>([]);
  const [fullAnswers, setFullAnswers] = useState<Record<string, string>>({});
  const [fullSessionMistakes, setFullSessionMistakes] = useState<Set<string>>(new Set());

  // Drill mode state
  const [drillQuestions, setDrillQuestions] = useState<Question[]>([]);
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillScore, setDrillScore] = useState(0);
  const [drillAnswered, setDrillAnswered] = useState(0);
  const [drillFinished, setDrillFinished] = useState(false);
  const [drillPerfect, setDrillPerfect] = useState(false);
  const [drillType, setDrillType] = useState<string>('');

  // Mistake book state
  const [mistakeLog, setMistakeLog] = useState<Question[]>([]);

  // Strategy state
  const [strategyTab, setStrategyTab] = useState<'all' | 'exclude' | 'rote'>('all');

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drillScoreRef = useRef(0);
  const masteredRef = useRef<Set<string>>(new Set());
  const errorsRef = useRef<Record<string, number>>({});
  const flushingRef = useRef(false);

  // Load user
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setUser(data); setLoading(false); })
      .catch(() => router.push('/login'));
  }, [router]);

  // Load progress from cloud
  useEffect(() => {
    fetch('/api/progress')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setMasteredIds(new Set(Object.keys(data.mastered || {})));
          setErrorCounts(data.mistakes || {});
        }
      })
      .catch(() => {});
  }, []);

  // Flush progress to server immediately (used on page close)
  const flushProgress = useCallback(() => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    const masteredObj: Record<string, boolean> = {};
    masteredRef.current.forEach(id => { masteredObj[id] = true; });
    const body = JSON.stringify({ mastered: masteredObj, mistakes: errorsRef.current, stats: {} });
    try {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/progress', blob);
    } catch {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
    setTimeout(() => { flushingRef.current = false; }, 1000);
  }, []);

  // Auto sync progress (debounced 3s)
  const syncProgress = useCallback((mastered: Set<string>, errors: Record<string, number>) => {
    masteredRef.current = mastered;
    errorsRef.current = errors;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const masteredObj: Record<string, boolean> = {};
      mastered.forEach(id => { masteredObj[id] = true; });
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mastered: masteredObj, mistakes: errors, stats: {} }),
      }).catch(() => {});
    }, 3000);
  }, []);

  // Save on page close
  useEffect(() => {
    const handler = () => { flushProgress(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushProgress]);

  const recordError = useCallback((id: string) => {
    setErrorCounts(prev => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 };
      syncProgress(masteredIds, next);
      return next;
    });
  }, [masteredIds, syncProgress]);

  const markMastered = useCallback((ids: string[]) => {
    setMasteredIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      syncProgress(next, errorCounts);
      return next;
    });
  }, [errorCounts, syncProgress]);

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  }

  // ===== Full Mode =====
  function initFullMode() {
    setFullQuestions([
      ...shuffle(singleData),
      ...shuffle(multiData),
      ...shuffle(tfData),
    ]);
    setFullAnswers({});
    setFullSessionMistakes(new Set());
  }

  function handleFullAnswer(qId: string, answer: string) {
    setFullAnswers(prev => ({ ...prev, [qId]: answer }));
    const q = allQuestions.find(x => x.id === qId);
    if (q && answer !== q.a) {
      setFullSessionMistakes(prev => new Set(prev).add(qId));
      recordError(qId);
    } else if (q && answer === q.a) {
      markMastered([qId]);
    }
  }

  function finishFullMode() {
    if (fullSessionMistakes.size === 0) {
      alert('太棒了！本次练习没有错题！');
      return;
    }
    const msg = `本次练习共 ${fullSessionMistakes.size} 道错题。\n\n是否进入【死磕模式】？\n（错题必须全部答对才能通关）`;
    if (confirm(msg)) {
      const mistakes = allChoiceQuestions.filter(q => fullSessionMistakes.has(q.id)) as Question[];
      startDrill(mistakes, '死磕错题');
    }
  }

  // ===== Drill Mode =====
  function getWeightedBatch(pool: Question[], count: number): Question[] {
    if (pool.length <= count) return pool;
    const weighted: Question[] = [];
    pool.forEach(q => {
      const w = 1 + (errorCounts[q.id] || 0) * 2;
      for (let i = 0; i < w; i++) weighted.push(q);
    });
    const result = new Set<Question>();
    while (result.size < count) {
      result.add(weighted[Math.floor(Math.random() * weighted.length)]);
    }
    return Array.from(result);
  }

  function startDrill(questions: Question[], label: string) {
    setDrillQuestions(shuffle(questions).map(q => shuffleOptions(q)));
    setDrillIndex(0);
    setDrillScore(0);
    drillScoreRef.current = 0;
    setDrillAnswered(0);
    setDrillFinished(false);
    setDrillPerfect(false);
    setMistakeLog([]);
    setDrillType(label);
  }

  function startNewBatch(type: string) {
    let source: Question[];
    let label: string;
    if (type === 'single') { source = singleData; label = '单选特训'; }
    else if (type === 'multi') { source = multiData; label = '多选特训'; }
    else { source = tfData; label = '判断特训'; }

    let batch: Question[];
    if (isReviewMode) {
      const pool = source.filter(q => masteredIds.has(q.id));
      if (pool.length === 0) { alert('还没有掌握任何题目，请先关闭复习模式'); return; }
      batch = getWeightedBatch(pool, 10);
    } else {
      const errorPool = source.filter(q => (errorCounts[q.id] || 0) > 0);
      const newPool = source.filter(q => !masteredIds.has(q.id));
      if (newPool.length === 0) {
        alert('该类型所有题目都已掌握！切换到复习模式');
        setIsReviewMode(true);
        batch = getWeightedBatch(source, 10);
      } else {
        const reviewCount = Math.min(4, errorPool.length);
        const reviewItems = getWeightedBatch(errorPool, reviewCount);
        const newItems = shuffle(newPool).slice(0, 10 - reviewItems.length);
        batch = [...reviewItems, ...newItems];
        if (batch.length < 10) {
          const remain = source.filter(x => !batch.includes(x));
          batch = [...batch, ...shuffle(remain).slice(0, 10 - batch.length)];
        }
      }
    }
    startDrill(batch, label);
  }

  function handleDrillAnswer(qId: string, answer: string) {
    const q = drillQuestions.find(x => x.id === qId);
    if (!q) return;
    const isCorrect = answer === q.a;
    if (isCorrect) {
      drillScoreRef.current += 1;
      setDrillScore(drillScoreRef.current);
    } else {
      recordError(qId);
      setMistakeLog(prev => prev.some(m => m.id === q.id) ? prev : [...prev, q]);
    }
    setDrillAnswered(prev => {
      const next = prev + 1;
      if (next === drillQuestions.length) {
        const perfect = drillScoreRef.current === drillQuestions.length;
        setDrillFinished(true);
        setDrillPerfect(perfect);
        if (perfect) {
          markMastered(drillQuestions.map(q => q.id));
        }
      }
      return next;
    });
  }

  // ===== Strategy =====
  function getStrategyQuestions() {
    if (strategyTab === 'all') return multiData.filter(q => q.a.length === 4);
    if (strategyTab === 'exclude') return multiData.filter(q => q.a.length === 3);
    return multiData.filter(q => q.a.length === 2);
  }

  function switchBank(key: BankKey) {
    if (key === bankKey) return;
    setBankKey(key);
    localStorage.setItem('exam_active_bank', key);
    setMode('full');
    setDrillQuestions([]);
    setDrillFinished(false);
  }

  // ===== Render =====
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>;
  }

  const totalChoice = allQuestions.length;
  const masteredCount = masteredIds.size;
  const progressPercent = Math.round((masteredCount / totalChoice) * 100);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">中国近代史刷题库</h1>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <button onClick={() => router.push('/exam')} className="text-orange-600 hover:underline font-medium">模拟考试</button>
            <button onClick={() => router.push('/leaderboard')} className="text-blue-600 hover:underline">排行榜</button>
            <span>{user?.realName || user?.username}</span>
            <button onClick={handleLogout} className="text-red-500 hover:underline">退出</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4">
        {/* Bank switcher */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-4">
          <div className="text-sm font-bold text-gray-700 mb-2">选择题库：</div>
          <div className="grid grid-cols-2 gap-2">
            {bankKeys.map(key => {
              const bank = banksData[key];
              const q = getBankQuestions(key);
              const isActive = key === bankKey;
              return (
                <button
                  key={key}
                  onClick={() => switchBank(key)}
                  className={`p-3 rounded-lg text-left transition border-2 ${isActive ? 'bg-amber-400 border-amber-500 text-white font-bold' : 'bg-white border-amber-200 text-gray-700 hover:bg-amber-100'}`}
                >
                  <div className="text-sm">{bank.label}</div>
                  <div className={`text-xs mt-1 ${isActive ? 'text-amber-100' : 'text-gray-400'}`}>
                    单选 {q.single.length} / 多选 {q.multi.length} / 判断 {q.tf.length}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-xs text-gray-400 mt-2">两个题库的进度和错题互不影响</div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>已掌握: {masteredCount}</span>
            <span>总题库: {totalChoice}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="text-right text-xs text-gray-500 mt-1">{progressPercent}%</div>
        </div>

        {/* Mode buttons */}
        <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isReviewMode} onChange={e => setIsReviewMode(e.target.checked)} className="w-4 h-4" />
                <span className={isReviewMode ? 'text-green-600 font-medium' : 'text-gray-600'}>
                  {isReviewMode ? '复习模式 (只抽已掌握)' : '优先新题 (智能穿插错题)'}
                </span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { key: 'full' as Mode, label: '全库浏览', color: 'bg-gray-700', action: () => { setMode('full'); initFullMode(); } },
              { key: 'drill-single' as Mode, label: '单选特训', color: 'bg-blue-500', action: () => { setMode('drill-single'); startNewBatch('single'); } },
              { key: 'drill-multi' as Mode, label: '多选特训', color: 'bg-purple-500', action: () => { setMode('drill-multi'); startNewBatch('multi'); } },
              { key: 'drill-tf' as Mode, label: '判断特训', color: 'bg-orange-500', action: () => { setMode('drill-tf'); startNewBatch('tf'); } },
              { key: 'strategy' as Mode, label: '记忆攻略', color: 'bg-yellow-500', action: () => setMode('strategy') },
            ].map(btn => (
              <button
                key={btn.key}
                onClick={btn.action}
                className={`${btn.color} text-white py-3 px-4 rounded-lg font-medium text-sm hover:opacity-90 transition ${mode === btn.key ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Full Mode */}
        {mode === 'full' && (
          <div>
            <button onClick={finishFullMode} className="mb-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 text-sm">
              完成本次练习，检查错题
            </button>
            {renderFullMode()}
          </div>
        )}

        {/* Drill Mode */}
        {(mode.startsWith('drill') || (drillQuestions.length > 0 && drillFinished === false && mode !== 'full' && mode !== 'strategy')) && drillQuestions.length > 0 && (
          <div>
            <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{drillType}</span>
                <span className="text-sm text-gray-500">{drillAnswered}/{drillQuestions.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(drillAnswered / drillQuestions.length) * 100}%` }} />
              </div>
            </div>

            {drillFinished ? (
              <div className="bg-white rounded-lg p-8 shadow-sm text-center">
                <h2 className={`text-2xl font-bold mb-4 ${drillPerfect ? 'text-green-600' : 'text-red-500'}`}>
                  {drillPerfect ? '完美通关！' : '挑战失败'}
                </h2>
                <p className="text-gray-600 mb-6">
                  {drillPerfect
                    ? '太棒了！这组题目已全部攻克。'
                    : `本轮得分：${drillScore}/${drillQuestions.length}，请重新挑战！`}
                </p>
                {drillPerfect ? (
                  <button onClick={() => startNewBatch(mode.replace('drill-', ''))} className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
                    下一组
                  </button>
                ) : (
                  <button onClick={() => startDrill(drillQuestions, drillType)} className="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600">
                    重新挑战
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {drillQuestions.map((q, idx) => (
                  <QuestionCard
                    key={q.id + '-' + idx}
                    question={q}
                    index={idx}
                    errorCount={errorCounts[q.id] || 0}
                    onAnswer={(ans) => handleDrillAnswer(q.id, ans)}
                    isDrill
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mistake Book - shown during drill mode when there are mistakes */}
        {mode.startsWith('drill') && mistakeLog.length > 0 && (
          <div className="mt-4">
            <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm mb-3">
              错题本 ({mistakeLog.length} 道)
            </div>
            <div className="space-y-3">
              {mistakeLog.map((q, idx) => {
                const correctText = q.type === 'tf'
                  ? (q.a === 'Y' ? '正确' : '错误')
                  : q.a.split('').map(c => {
                      const i = c.charCodeAt(0) - 65;
                      return q.options ? `${c}. ${q.options[i]}` : c;
                    }).join('、');
                return (
                  <div key={q.id} className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-red-500">
                    <div className="font-medium text-gray-800 mb-2">
                      <span className="text-red-500 font-bold">[错题 {idx + 1}]</span> {q.q}
                    </div>
                    <div className="bg-green-50 rounded p-3 text-sm">
                      <span className="font-bold text-green-700">正确答案：{q.a}</span>
                      <div className="mt-1 text-gray-600">{correctText}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategy Mode */}
        {mode === 'strategy' && (
          <div>
            <div className="flex gap-2 mb-4">
              {[
                { key: 'all' as const, label: '全选型 (ABCD)' },
                { key: 'exclude' as const, label: '排除型 (4选3)' },
                { key: 'rote' as const, label: '死记型 (4选2)' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStrategyTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${strategyTab === tab.key ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600 border'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500 mb-3 italic">
              {strategyTab === 'all' && '技巧：看到特征、作用、表现，通常是全选 (ABCD)'}
              {strategyTab === 'exclude' && '技巧：记住那个错误选项，考试时排除它！'}
              {strategyTab === 'rote' && '技巧：这些容易混淆，需要死记硬背核心词'}
            </div>
            <div className="space-y-3">
              {getStrategyQuestions().map((q, idx) => (
                <StrategyCard key={q.id} question={q} index={idx} type={strategyTab} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderFullMode() {
    const sections = [
      { title: '一、单项选择题', questions: fullQuestions.filter(q => q.type === 'single') },
      { title: '二、多项选择题', questions: fullQuestions.filter(q => q.type === 'multi') },
      { title: '三、判断题', questions: fullQuestions.filter(q => q.type === 'tf') },
    ];

    return (
      <div className="space-y-6">
        {sections.map(sec => (
          <div key={sec.title}>
            <div className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm mb-3">
              {sec.title}
            </div>
            <div className="space-y-4">
              {sec.questions.map((q, idx) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={idx}
                  errorCount={errorCounts[q.id] || 0}
                  onAnswer={q.type === 'essay' ? undefined : (ans) => handleFullAnswer(q.id, ans)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
}

// ===== Question Card Component =====
function QuestionCard({
  question: rawQ,
  index,
  errorCount,
  onAnswer,
  isDrill = false,
}: {
  question: Question;
  index: number;
  errorCount: number;
  onAnswer?: (answer: string) => void;
  isDrill?: boolean;
}) {
  const [q] = useState(() => (isDrill ? rawQ : shuffleOptions(rawQ)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [showEssayAnswer, setShowEssayAnswer] = useState(false);

  const diffClass = q.diff === '难' ? 'bg-red-100 text-red-700' : q.diff === '中' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';

  if (q.type === 'essay') {
    return (
      <div className="bg-white rounded-lg p-5 shadow-sm">
        <div className="font-medium text-gray-800 mb-3">
          {index + 1}. {q.q}
          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${diffClass}`}>{q.diff}</span>
        </div>
        <button
          onClick={() => setShowEssayAnswer(!showEssayAnswer)}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
        >
          {showEssayAnswer ? '隐藏答案' : '显示参考答案'}
        </button>
        {showEssayAnswer && (
          <div className="mt-3 p-4 bg-green-50 rounded-lg text-sm text-gray-700 leading-relaxed">
            <strong>参考答案：</strong>
            <ul className="list-decimal ml-5 mt-2 space-y-1">
              {q.a.split(/<br\s*\/?>/i).map((line: string, i: number) => (
                <li key={i}>{line.replace(/<[^>]*>/g, '')}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const isMulti = q.type === 'multi';
  const options = q.type === 'tf'
    ? [{ text: '正确 (Y)', val: 'Y' }, { text: '错误 (N)', val: 'N' }]
    : q.options!.map((opt, i) => ({ text: opt, val: String.fromCharCode(65 + i) }));

  function handleSelect(val: string) {
    if (submitted) return;
    if (isMulti) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(val) ? next.delete(val) : next.add(val);
        return next;
      });
    } else {
      setSelected(new Set([val]));
      handleSubmit(val);
    }
  }

  function handleSubmit(forceSingle?: string) {
    if (submitted) return;
    if (!isMulti && !forceSingle) return;
    if (isMulti && selected.size === 0) return;

    const answer = forceSingle || Array.from(selected).sort().join('');
    setSubmitted(true);
    onAnswer?.(answer);
  }

  const userAnswer = submitted ? (Array.from(selected).sort().join('') || null) : null;

  return (
    <div className="bg-white rounded-lg p-5 shadow-sm">
      <div className="font-medium text-gray-800 mb-3">
        {index + 1}. {q.q}
        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${diffClass}`}>{q.diff}</span>
        {errorCount > 0 && <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">曾错 {errorCount} 次</span>}
      </div>
      <div className="space-y-2">
        {options.map(opt => {
          let cls = 'border border-gray-200 hover:bg-blue-50 hover:border-blue-300';
          if (submitted) {
            const isCorrect = q.a.includes(opt.val);
            const isSelected = selected.has(opt.val);
            if (isCorrect) cls = 'bg-green-50 border-green-500 text-green-700';
            else if (isSelected && !isCorrect) cls = 'bg-red-50 border-red-500 text-red-700';
          } else if (selected.has(opt.val)) {
            cls = 'bg-blue-50 border-blue-400';
          }

          return (
            <button
              key={opt.val}
              onClick={() => handleSelect(opt.val)}
              disabled={submitted}
              className={`w-full text-left px-4 py-3 rounded-lg transition text-sm ${cls}`}
            >
              {opt.val}. {opt.text}
              {submitted && q.a.includes(opt.val) && ' ✓'}
              {submitted && selected.has(opt.val) && !q.a.includes(opt.val) && ' ✕'}
            </button>
          );
        })}
      </div>
      {isMulti && !submitted && (
        <button
          onClick={() => handleSubmit()}
          disabled={selected.size === 0}
          className="mt-3 bg-blue-500 text-white px-6 py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          提交本题
        </button>
      )}
    </div>
  );
}

// ===== Strategy Card =====
function StrategyCard({ question: q, index, type }: { question: Question; index: number; type: string }) {
  return (
    <div className={`bg-white rounded-lg p-5 shadow-sm border-l-4 ${type === 'all' ? 'border-green-500' : type === 'exclude' ? 'border-red-500' : 'border-purple-500'}`}>
      <div className="font-medium text-gray-800 mb-3">{index + 1}. {q.q}</div>
      <div className="space-y-1">
        {q.options!.map((opt, idx) => {
          const char = String.fromCharCode(65 + idx);
          const isCorrect = q.a.includes(char);
          return (
            <div key={idx} className={`px-3 py-2 rounded text-sm ${isCorrect ? 'bg-green-50 text-green-700' : type === 'exclude' ? 'bg-red-50 text-red-400 line-through opacity-60' : 'bg-gray-50 text-gray-500'}`}>
              {isCorrect ? '✅' : '❌'} {char}. {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}
