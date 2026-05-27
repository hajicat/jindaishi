import { hash } from 'bcryptjs';

const password = process.argv[2] || 'admin123';
const hashed = await hash(password, 10);
console.log(`Password: ${password}`);
console.log(`Hash: ${hashed}`);
console.log(`\nRun this SQL in Turso to create admin:`);
console.log(`INSERT INTO users (id, username, real_name, class_name, password_hash, role, status, created_at, updated_at) VALUES ('admin-001', 'admin', '管理员', '管理组', '${hashed}', 'admin', 'active', datetime('now'), datetime('now'));`);
