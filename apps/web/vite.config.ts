import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const maplibreSharedModule = fileURLToPath(new URL('./node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs', import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, repositoryRoot, '');

  return {
    define: {
      'import.meta.env.VITE_MAPID_API_KEY': JSON.stringify(environment.MAPID_API_KEY ?? ''),
      ...(environment.VITE_API_URL ? { 'import.meta.env.VITE_API_URL': JSON.stringify(environment.VITE_API_URL) } : {}),
      ...(environment.VITE_MARTIN_URL ? { 'import.meta.env.VITE_MARTIN_URL': JSON.stringify(environment.VITE_MARTIN_URL) } : {}),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      tailwindcss(),
      tanstackRouter(),
      react(),
      {
        name: 'copy-maplibre-shared-worker-module',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'assets/maplibre-gl-shared.mjs',
            source: readFileSync(maplibreSharedModule),
          });
        },
      },
    ],
  };
});
