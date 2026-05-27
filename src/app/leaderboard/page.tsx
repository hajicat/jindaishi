'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LeaderboardEntry {
  id: string;
  username: string;
  realName: string;
  className: string;
  masteredCount: number;
  totalErrors: number;
  accuracy: number;
  mastery: number;
  totalQuestions: number;
  updatedAt: string;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [sortBy, setSortBy] = useState<'mastered' | 'accuracy'>('mastered');

  useEffect(() => {
    // Get current user
    fetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => {
        setCurrentUserId(user.id);
      })
      .catch(() => router.push('/login'));

    // Get leaderboard
    fetch('/api/leaderboard')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const sorted = [...data].sort((a, b) =>
    sortBy === 'mastered' ? b.masteredCount - a.masteredCount : b.accuracy - a.accuracy
  );

  function getRankBadge(rank: number) {
    if (rank === 1) return 'bg-yellow-400 text-yellow-900';
    if (rank === 2) return 'bg-gray-300 text-gray-700';
    if (rank === 3) return 'bg-amber-600 text-amber-50';
    return 'bg-gray-100 text-gray-600';
  }

  function timeAgo(dateStr: string) {
    if (!dateStr) return '从未';
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
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">排行榜</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/quiz')} className="text-sm text-blue-600 hover:underline">返回刷题</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4">
        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{data.length}</div>
            <div className="text-xs text-gray-500">参与人数</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">
              {data.length > 0 ? Math.round(data.reduce((s, d) => s + d.masteredCount, 0) / data.length) : 0}
            </div>
            <div className="text-xs text-gray-500">平均掌握题数</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-purple-600">
              {data.length > 0 ? Math.round(data.reduce((s, d) => s + d.accuracy, 0) / data.length) : 0}%
            </div>
            <div className="text-xs text-gray-500">平均正确率</div>
          </div>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSortBy('mastered')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${sortBy === 'mastered' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            掌握题数排行
          </button>
          <button
            onClick={() => setSortBy('accuracy')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${sortBy === 'accuracy' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border'}`}
          >
            正确率排行
          </button>
        </div>

        {/* Leaderboard table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="py-3 px-4 w-12">排名</th>
                <th className="py-3 px-4">姓名</th>
                <th className="py-3 px-4">班级</th>
                <th className="py-3 px-4 text-center">掌握题数</th>
                <th className="py-3 px-4 text-center">掌握率</th>
                <th className="py-3 px-4 text-center">正确率</th>
                <th className="py-3 px-4 text-right">最后活跃</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = entry.id === currentUserId;
                return (
                  <tr
                    key={entry.id}
                    className={`border-t transition ${isMe ? 'bg-blue-50 font-medium' : 'hover:bg-gray-50'}`}
                  >
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getRankBadge(rank)}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {entry.realName}
                      {isMe && <span className="ml-1 text-xs text-blue-500">(我)</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-500">{entry.className || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-medium">{entry.masteredCount}</span>
                      <span className="text-gray-400">/{entry.totalQuestions}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${entry.mastery}%` }} />
                        </div>
                        <span className="text-gray-600 w-12 text-right">{entry.mastery}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={entry.accuracy >= 80 ? 'text-green-600' : entry.accuracy >= 60 ? 'text-yellow-600' : 'text-red-500'}>
                        {entry.accuracy}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400 text-xs">
                      {timeAgo(entry.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div className="text-center text-gray-400 py-12">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
