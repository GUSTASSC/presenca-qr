import '../server.js';
import {randomBytes} from 'node:crypto';
import {updateEnv} from '../lib/postgres-migration.js';
if(!process.env.IDENTITY_KEY)updateEnv({IDENTITY_KEY:randomBytes(32).toString('base64url')});
console.log('Chave de proteção dos identificadores configurada localmente; valor não exibido.');
