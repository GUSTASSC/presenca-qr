export function migrateSQLiteCatechists(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS class_catechists(
      id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),
      user_id INTEGER NOT NULL REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
      added_at TEXT NOT NULL,added_by INTEGER NOT NULL REFERENCES users(id),UNIQUE(class_id,user_id));
    CREATE INDEX IF NOT EXISTS class_catechists_user ON class_catechists(user_id,class_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS catechist_invites(
      id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),accepted_at TEXT,
      accepted_by INTEGER REFERENCES users(id),revoked_at TEXT);
    CREATE INDEX IF NOT EXISTS catechist_invites_class ON catechist_invites(class_id,email);
    CREATE VIEW IF NOT EXISTS teacher_classes AS SELECT id AS class_id,teacher_id AS user_id FROM classes
      UNION SELECT class_id,user_id FROM class_catechists WHERE active=1;
  `);
  if (!db.prepare('PRAGMA table_info(logs)').all().some(column=>column.name==='class_id')) {
    db.exec(`ALTER TABLE logs ADD COLUMN class_id INTEGER REFERENCES classes(id);
      CREATE INDEX logs_class ON logs(class_id,id DESC);
      UPDATE logs SET class_id=CASE
        WHEN entity='classes' THEN (SELECT id FROM classes WHERE id=logs.record_id)
        WHEN entity='students' THEN (SELECT class_id FROM students WHERE id=logs.record_id)
        WHEN entity='calls' THEN (SELECT class_id FROM calls WHERE id=logs.record_id)
        WHEN entity='attendance' THEN (SELECT c.class_id FROM attendance a JOIN calls c ON c.id=a.call_id WHERE a.id=logs.record_id)
        WHEN entity='corrections' THEN (SELECT s.class_id FROM corrections r JOIN students s ON s.id=r.student_id WHERE r.id=logs.record_id)
      END;`);
  }
}
