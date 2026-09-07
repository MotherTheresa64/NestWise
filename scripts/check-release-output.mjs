import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
// This is a focused leak regression check, not a substitute for a secret scanner/security review.
const forbidden = ['http://localhost:3001', 'ws://localhost:3001', 'nestwise_local', 'seed-fictional.mjs', 'RESEND_API_KEY=', 'postgresql://'];
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await scan(file);
    else {
      const bytes = await readFile(file);
      for (const value of forbidden) if (bytes.includes(value)) throw new Error(`Release contains a development/server-only marker in ${file}`);
      for (const key of ['RESEND_API_KEY', 'DATABASE_URL']) if (process.env[key] && bytes.includes(process.env[key])) throw new Error(`Release contains a server secret in ${file}`);
    }
  }
}
if (!process.argv[2]) throw new Error('Pass an exported web/native directory to scan');
await scan(process.argv[2]);
