import pg from 'pg';
import { buildApi } from './app';
import { poolConfig } from './config';
import { accountMailer } from './mail';
async function main() {
const pool = new pg.Pool(poolConfig());
pool.on('error', () => console.error('Idle database connection failed'));
const app = await buildApi(pool, { deliverAccountMail: accountMailer() });
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25000); deadline.unref();
  try { await app.close(); await pool.end(); clearTimeout(deadline); }
  catch { process.exitCode = 1; void pool.end().catch(() => {}); /* Keep the shutdown deadline if a resource failed to close. */ }
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void stop());
try {
  await pool.query('SELECT 1 FROM users LIMIT 1');
  await app.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '0.0.0.0' });
} catch { console.error('API startup failed: check environment, database connectivity and migrations'); await stop(); process.exitCode = 1; }
}
void main().catch(() => { console.error('API initialization failed: check deployment configuration'); process.exitCode = 1; });
