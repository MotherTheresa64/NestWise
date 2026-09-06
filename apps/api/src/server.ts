import pg from 'pg';
import { buildApi } from './app';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN?.startsWith('https://')) throw new Error('Production requires an HTTPS CORS_ORIGIN');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const app = await buildApi(pool);
await app.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '127.0.0.1' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void app.close().then(() => pool.end()));
