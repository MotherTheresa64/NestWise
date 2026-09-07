import { defineConfig } from 'tsup';
import { copyFile } from 'node:fs/promises';
export default defineConfig({ entry: ['src/server.ts', 'src/migrate.ts'], format: ['esm'], noExternal: ['@nestwise/shared'], clean: true, sourcemap: true,
  onSuccess: async () => { await copyFile('src/schema.sql', 'dist/schema.sql'); } });
