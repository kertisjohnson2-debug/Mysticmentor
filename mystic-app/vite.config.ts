import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const repoRoot = path.resolve(__dirname, '..');

const tarotArtworkPlugin = (): Plugin => {
  return {
  name: 'mysticmentor-tarot-artwork',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (importer && source === '../../../tarot-artwork-mapping.json') {
      return '\0mysticmentor-tarot-mapping';
    }
    return null;
  },
  load(id: string): string | null {
    if (id === '\0mysticmentor-tarot-mapping') {
      return `export default ${fs.readFileSync(path.resolve(repoRoot, 'tarot-artwork-mapping.json'), 'utf8')};`;
    }
    return null;
  },
  };
};

export default defineConfig(() => {
  return {
    plugins: [tarotArtworkPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
