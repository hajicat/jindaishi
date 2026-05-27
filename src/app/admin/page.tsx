'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  real_name: string;
  class_name: string;
  role: string;
  status: string;
  created_at: string;
}

interface Device {
  id: string;
  device_name: string;
  device_fingerprint: string;
  created_at: string;
  expires_at: string;
  username: string;
  real_name: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', realName: '', className: '', password: '' });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Device modal
  const [deviceUser, setDeviceUser] = useState<{ id: string; name: string } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (data.role !== 'admin') { router.push('/quiz'); return; }
        loadUsers();
      })
      .catch(() => router.push('/login'));
  }, [router]);

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ type: 'ok', text: `用户 ${form.username} 添加成功` });
      setForm({ username: '', realName: '', className: '', password: '' });
      setShowAdd(false);
      loadUsers();
    } else {
      setMsg({ type: 'err', text: data.error });
    }
  }

  async function toggleStatus(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_status' }),
    });
    if (res.ok) loadUsers();
  }

  async function resetPassword(id: string, username: string) {
    const pw = prompt(`请输入用户 ${username} 的新密码：`);
    if (!pw) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', password: pw }),
    });
    if (res.ok) {
      setMsg({ type: 'ok', text: `用户 ${username} 密码已重置` });
    }
  }

  async function deleteUser(id: string, username: string) {
    if (!confirm(`确定要删除用户 ${username} 吗？此操作不可恢复！`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMsg({ type: 'ok', text: `用户 ${username} 已删除` });
      loadUsers();
    }
  }

  async function loadDevices(userId: string, userName: string) {
    setDeviceUser({ id: userId, name: userName });
    setDeviceLoading(true);
    const res = await fetch(`/api/admin/devices?userId=${userId}`);
    if (res.ok) {
      setDevices(await res.json());
    }
    setDeviceLoading(false);
  }

  async function unbindDevice(sessionId: string) {
    if (!confirm('确定要解绑此设备吗？该设备将被强制下线。')) return;
    const res = await fetch('/api/admin/devices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok && deviceUser) {
      loadDevices(deviceUser.id, deviceUser.name);
    }
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">管理员后台</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/quiz')} className="text-sm text-blue-600 hover:underline">进入刷题</button>
            <button onClick={handleLogout} className="text-sm text-red-500 hover:underline">退出</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6">
        {msg && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {msg.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800">用户管理</h2>
            <button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              {showAdd ? '取消' : '+ 添加学生'}
            </button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm text-gray-600 mb-1">账号 (学号) *</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="如 2024001" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">姓名</label>
                <input value={form.realName} onChange={e => setForm({ ...form, realName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="张三" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">班级</label>
                <input value={form.className} onChange={e => setForm({ ...form, className: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="如 24级计算机1班" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">初始密码 *</label>
                <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="至少6位" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-green-700">
                  确认添加
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">账号</th>
                  <th className="py-2 pr-4">姓名</th>
                  <th className="py-2 pr-4">班级</th>
                  <th className="py-2 pr-4">角色</th>
                  <th className="py-2 pr-4">状态</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 pr-4 font-mono">{u.username}</td>
                    <td className="py-3 pr-4">{u.real_name || '-'}</td>
                    <td className="py-3 pr-4">{u.class_name || '-'}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role === 'admin' ? '管理员' : '学生'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.status === 'active' ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td className="py-3">
                      {u.role !== 'admin' && (
                        <div className="flex gap-2">
                          <button onClick={() => toggleStatus(u.id)} className="text-xs text-orange-600 hover:underline">
                            {u.status === 'active' ? '禁用' : '启用'}
                          </button>
                          <button onClick={() => resetPassword(u.id, u.username)} className="text-xs text-blue-600 hover:underline">
                            重置密码
                          </button>
                          <button onClick={() => loadDevices(u.id, u.real_name || u.username)} className="text-xs text-purple-600 hover:underline">
                            设备
                          </button>
                          <button onClick={() => deleteUser(u.id, u.username)} className="text-xs text-red-600 hover:underline">
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center text-gray-400 py-8">暂无用户，点击上方按钮添加</div>
          )}
        </div>
      </div>

      {/* Device Modal */}
      {deviceUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeviceUser(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">{deviceUser.name} — 登录设备</h3>
              <button onClick={() => setDeviceUser(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            {deviceLoading ? (
              <div className="text-center text-gray-400 py-8">加载中...</div>
            ) : devices.length === 0 ? (
              <div className="text-center text-gray-400 py-8">暂无登录设备</div>
            ) : (
              <div className="space-y-3">
                {devices.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm text-gray-800">{d.device_name || '未知设备'}</div>
                      <div className="text-xs text-gray-400">
                        登录于 {new Date(d.created_at).toLocaleString('zh-CN')}
                      </div>
                      <div className="text-xs text-gray-400">
                        过期于 {new Date(d.expires_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <button
                      onClick={() => unbindDevice(d.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      解绑
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-xs text-gray-400">
              每个账号最多绑定 2 台设备。解绑后该设备需要重新登录。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
