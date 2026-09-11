import { createApp } from '../server.js';
import { randomBytes } from 'node:crypto';
import { connectDatabase } from '../lib/supabase-db.js';
import { migrateStructure, auditStructure, importDemo } from '../lib/postgres-migration.js';

export async function testApp(t,options={}) {
  options={authProvider:null,...options};
  let admin, schema, app;
  t.after(async () => {
    if (app) {
      app.server.closeAllConnections();
      await new Promise(resolve => app.server.close(resolve));
      await app.db.close();
    }
    if (admin) {
      // This exact, random schema belongs to this test invocation only.
      try { await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await admin.end({timeout:5}); }
    }
  });
  if (process.env.TEST_DB_PROVIDER === 'postgres') {
    schema = 'presenca_test_' + randomBytes(8).toString('hex');
    admin = connectDatabase();
    await migrateStructure(admin, schema);
    await auditStructure(admin, schema);
    const source = await createApp({ provider:'sqlite', dbPath:':memory:', seed:true });
    try { await importDemo(admin, schema, source.db); }
    finally { await source.db.close(); }
    app = await createApp({ provider:'postgres', schema,...options });
  } else {
    app = await createApp({ provider: 'sqlite', dbPath: ':memory:', seed: true,...options });
  }
  return app;
}
