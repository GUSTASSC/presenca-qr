import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function backupSQLite() {
  const source = path.join(root, 'data/presenca.sqlite');
  if (!existsSync(source)) throw new Error('Banco SQLite original não encontrado.');
  const directory = path.join(root, 'data/backups');
  mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `presenca-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, target); } finally { db.close(); }
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Falha na integridade do backup.');
  } finally { check.close(); }
  return target;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Backup SQLite verificado:', await backupSQLite());
}
