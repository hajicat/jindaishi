'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LeaderboardEntry {
  id: string;
  username: string;
  realName: string;
  className: string;
  bestScore: number;
  total: number;
  singleCorrect: number;
  singleTotal: number;
  multiCorrect: number;
  multiTotal: number;
  tfCorrect: number;
  tfTotal: number;
  examCount: number;
  examDate: string;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => setCurrentUserId(user.id))
      .catch(() => router.push('/login'));

    fetch('/api/leaderboard')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const sorted = [...data].sort((a, b) => b.bestScore - a.bestScore);

  const participants = data.filter(d => d.examCount > 0);
  const avgScore = participants.length > 0
    ? Math.round(participants.reduce((s, d) => s + d.bestScore, 0) / participants.length)
    : 0;

  function getRankBadge(rank: number) {
    if (rank === 1) return 'bg-yellow-400 text-yellow-900';
    if (rank === 2) return 'bg-gray-300 text-gray-700';
    if (rank === 3) return 'bg-amber-600 text-amber-50';
    return 'bg-gray-100 text-gray-600';
  }

  function timeAgo(dateStr: string) {
    if (!dateStr) return '从未考试';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">考试排行榜</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/quiz')} className="text-sm text-blue-600 hover:underline">返回刷题</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{participants.length}</div>
            <div className="text-xs text-gray-500">参考人数</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">{avgScore}</div>
            <div className="text-xs text-gray-500">平均最高分</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-purple-600">
              {participants.length > 0 ? Math.round(participants.reduce((s, d) => s + d.examCount, 0) / participants.length) : 0}
            </div>
            <div className="text-xs text-gray-500">人均考试次数</div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="py-3 px-3 w-12">排名</th>
                <th className="py-3 px-3">姓名</th>
                <th className="py-3 px-3">班级</th>
                <th className="py-3 px-3 text-center">最高分</th>
                <th className="py-3 px-3 text-center">单选</th>
                <th className="py-3 px-3 text-center">多选</th>
                <th className="py-3 px-3 text-center">判断</th>
                <th className="py-3 px-3 text-center">考试次数</th>
                <th className="py-3 px-3 text-right">最近考试</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = entry.id === currentUserId;
                const percent = Math.round((entry.bestScore / entry.total) * 100);
                return (
                  <tr
                    key={entry.id}
                    className={`border-t transition ${isMe ? 'bg-blue-50 font-medium' : 'hover:bg-gray-50'}`}
                  >
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getRankBadge(rank)}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {entry.realName}
                      {isMe && <span className="ml-1 text-xs text-blue-500">(我)</span>}
                    </td>
                    <td className="py-3 px-3 text-gray-500">{entry.className || '-'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-bold text-lg ${percent >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.bestScore}
                      </span>
                      <span className="text-gray-400">/{entry.total}</span>
                    </td>
                    <td className="py-3 px-3 text-center text-gray-600">
                      {entry.singleCorrect}/{entry.singleTotal}
                    </td>
                    <td className="py-3 px-3 text-center text-gray-600">
                      {entry.multiCorrect}/{entry.multiTotal}
                    </td>
                    <td className="py-3 px-3 text-center text-gray-600">
                      {entry.tfCorrect}/{entry.tfTotal}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                        {entry.examCount} 次
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-400 text-xs">
                      {timeAgo(entry.examDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="text-center text-gray-400 py-12">暂无考试数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
