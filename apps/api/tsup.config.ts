import { defineConfig } from 'tsup';
import { copyFile } from 'node:fs/promises';
export default defineConfig({ entry: ['src/server.ts', 'src/migrate.ts'], format: ['esm'], noExternal: ['@nestwise/shared'], clean: true, sourcemap: true,
  onSuccess: async () => { for (const file of ['schema.sql','002-foods.sql']) await copyFile(`src/${file}`, `dist/${file}`); } });
