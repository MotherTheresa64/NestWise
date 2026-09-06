import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts'], format: ['esm'], noExternal: ['@nestwise/shared'], clean: true, sourcemap: true });
