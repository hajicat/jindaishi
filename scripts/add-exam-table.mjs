import { createClient } from '@libsql/client';

const db = createClient({
  url: 'libsql://jindaishi-hajicat.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3Nzk4NTg1ODcsImlkIjoiMDE5ZTY3ZDUtOWMwMS03ZTg0LTlhMjYtNWIwMWM3M2NhYmNjIiwicmlkIjoiYjgwOTcxNzAtNGNmMi00NGMzLTk0ZjMtNTZkZmU5MDUwOTk2In0.gIPusghAb8s5HQnqSFI_E0LyIyQZ82LByaaKwWGL8ZK2lfQ3z-PQiotyhkCscb6O9KNmtZwf5gw8CIuvPDp7DA'
});

console.log('Creating exam_results table...');

await db.execute(`
  CREATE TABLE IF NOT EXISTS exam_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    single_correct INTEGER DEFAULT 0,
    single_total INTEGER DEFAULT 0,
    multi_correct INTEGER DEFAULT 0,
    multi_total INTEGER DEFAULT 0,
    tf_correct INTEGER DEFAULT 0,
    tf_total INTEGER DEFAULT 0,
    details_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);

console.log('Done!');
