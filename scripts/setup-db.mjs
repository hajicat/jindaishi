import { createClient } from '@libsql/client';
import { hash } from 'bcryptjs';

const db = createClient({
  url: 'libsql://jindaishi-hajicat.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3Nzk4NTg1ODcsImlkIjoiMDE5ZTY3ZDUtOWMwMS03ZTg0LTlhMjYtNWIwMWM3M2NhYmNjIiwicmlkIjoiYjgwOTcxNzAtNGNmMi00NGMzLTk0ZjMtNTZkZmU5MDUwOTk2In0.gIPusghAb8s5HQnqSFI_E0LyIyQZ82LByaaKwWGL8ZK2lfQ3z-PQiotyhkCscb6O9KNmtZwf5gw8CIuvPDp7DA'
});

console.log('Creating tables...');

const tables = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, real_name TEXT, class_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY, mastered_json TEXT DEFAULT '{}', mistakes_json TEXT DEFAULT '{}', stats_json TEXT DEFAULT '{}', updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS admin_logs (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_user_id TEXT, detail TEXT, created_at TEXT NOT NULL)`
];

for (const sql of tables) {
  await db.execute(sql);
  console.log('OK');
}

console.log('\nCreating admin account...');
const passwordHash = await hash('admin123', 10);
const now = new Date().toISOString();

await db.execute({
  sql: `INSERT OR REPLACE INTO users (id, username, real_name, class_name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: ['admin-001', 'admin', '管理员', '管理组', passwordHash, 'admin', 'active', now, now],
});

console.log('Done! Admin account:');
console.log('  Username: admin');
console.log('  Password: admin123');
console.log('\n请登录后立即修改密码！');
