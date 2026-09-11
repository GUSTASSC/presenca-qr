import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { sqliteSchema } from './sqlite-schema.js';
import { migrateSQLiteCatechists } from './sqlite-catechists.js';
import { migrateSQLiteAccounts } from './sqlite-accounts.js';
import { connectDatabase } from './supabase-db.js';

export function validSchema(schema) {
  if (!/^presenca(?:_[a-z0-9_]+)?$/.test(schema) || schema.length > 63) {
    throw new Error('Use um schema privado chamado presenca ou presenca_*.');
  }
  return schema;
}

// Only application-authored SQL is accepted here; values remain parameters.
export function postgresParameters(query) {
  let count = 0;
  return query.replace(/'(?:''|[^'])*'|\?/g, part => part === '?' ? `$${++count}` : part);
}

export async function openDatabase({ provider, dbPath, schema }) {
  const context = new AsyncLocalStorage();
  if (provider === 'sqlite') {
    if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
    const raw = new DatabaseSync(dbPath, { timeout: 5000 });
    raw.exec(sqliteSchema);
    raw.exec('BEGIN IMMEDIATE');
    try { migrateSQLiteCatechists(raw); migrateSQLiteAccounts(raw); raw.exec('COMMIT'); }
    catch(error) {raw.exec('ROLLBACK');raw.close();throw error;}
    // Awaiting SQLite calls yields to other requests. Serialize transactions on
    // this connection so requests never share another request's transaction.
    let queue = Promise.resolve();
    const tx = fn => {
      if (context.getStore()) return fn();
      const work = queue.then(() => context.run(true, async () => {
        raw.exec('BEGIN IMMEDIATE');
        try { const result = await fn(); raw.exec('COMMIT'); return result; }
        catch (error) { raw.exec('ROLLBACK'); throw error; }
      }));
      queue = work.catch(() => {});
      return work;
    };
    return {
      provider,
      get: async (query, ...args) => raw.prepare(query).get(...args),
      all: async (query, ...args) => raw.prepare(query).all(...args),
      run: async (query, ...args) => raw.prepare(query).run(...args),
      tx, request: (_method, fn) => tx(fn),
      close: async () => { await queue; raw.close(); },
    };
  }
  if (provider !== 'postgres') throw new Error('DB_PROVIDER deve ser sqlite ou postgres.');
  validSchema(schema);
  const sql = connectDatabase(process.env, { application: true });
  const transact = (fn, write = true) => {
    if (context.getStore()) return fn();
    return sql.begin(write ? 'read write' : 'isolation level repeatable read read only', async scoped => {
      await scoped`select set_config('search_path', ${schema + ',pg_catalog'}, true),
        set_config('statement_timeout','15000',true), set_config('lock_timeout','10000',true)`;
      // Keep the original SQLite ordering guarantee across Node processes too.
      // Mutations are short and serialized per application schema; reads do not
      // acquire the lock. This prevents duplicate scans and scan/close races.
      if (write) await scoped`select pg_advisory_xact_lock(hashtextextended(${schema}, 0))`;
      return context.run(scoped, fn);
    });
  };
  const query = async (statement, args) => {
    const execute = async () => {
      const rows = await context.getStore().unsafe(postgresParameters(statement), args);
      return rows;
    };
    return context.getStore() ? execute() : transact(execute);
  };
  const db = {
    provider, schema,
    get: async (statement, ...args) => (await query(statement, args))[0],
    all: async (statement, ...args) => Array.from(await query(statement, args)),
    run: async (statement, ...args) => {
      const hasId = /^\s*INSERT\s+INTO\s+(users|classes|students|calls|attendance|corrections|logs|class_catechists|catechist_invites|password_resets)\b/i.test(statement);
      const rows = await query(statement + (hasId ? ' RETURNING id' : ''), args);
      return { lastInsertRowid: hasId ? rows[0]?.id : undefined, changes: rows.count };
    },
    tx: fn => transact(fn),
    request: (method, fn) => transact(fn, method !== 'GET'),
    close: () => sql.end({ timeout: 5 }),
  };
  try {
    await db.get('SELECT id FROM users LIMIT 1');
    return db;
  } catch (error) { await db.close(); throw error; }
}
