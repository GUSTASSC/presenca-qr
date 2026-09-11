import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--test', ...(process.argv.length>2?process.argv.slice(2):['test/*.test.js'])], {
  stdio: 'inherit', env: {...process.env, TEST_DB_PROVIDER:'postgres'},
});
child.on('exit', code => {process.exitCode = code ?? 1;});
