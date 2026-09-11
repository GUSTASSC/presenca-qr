export function migrateSQLiteAccounts(db){
 const userColumns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
 for(const name of ['cpf_hash','phone_hash','phone_encrypted','supabase_user_id','email_verified_at'])if(!userColumns.has(name))db.exec(`ALTER TABLE users ADD COLUMN ${name} TEXT`);
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_user_id ON users(supabase_user_id)');
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_hash ON users(cpf_hash); CREATE UNIQUE INDEX IF NOT EXISTS users_phone_hash ON users(phone_hash);');
 if(!db.prepare('PRAGMA table_info(students)').all().some(c=>c.name==='student_code'))db.exec('ALTER TABLE students ADD COLUMN student_code TEXT');
 db.exec(`UPDATE students SET student_code=upper(hex(randomblob(5))) WHERE student_code IS NULL;
 CREATE UNIQUE INDEX IF NOT EXISTS students_code ON students(student_code);
 CREATE TABLE IF NOT EXISTS password_resets(
 id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,created_at TEXT NOT NULL,used_at TEXT);
 CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
 CREATE INDEX IF NOT EXISTS password_resets_expiry ON password_resets(expires_at);`);
 if(!db.prepare('PRAGMA table_info(password_resets)').all().some(c=>c.name==='auth_session'))db.exec('ALTER TABLE password_resets ADD COLUMN auth_session TEXT');
}
