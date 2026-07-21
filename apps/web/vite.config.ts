import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const rootPath = fileURLToPath(new URL('../..', import.meta.url));
const DEVELOPMENT_SEAM_SENTINEL = '__lightframeDevelopmentRealtimeDriver';
export const DEVELOPMENT_API_PROXY_TIMEOUT_MS = 210_000;

export const DEVELOPMENT_API_PROXY = {
  target: 'http://127.0.0.1:4100',
  // Vite 8's string shorthand enables changeOrigin. Preserve the browser-facing
  // Host so the API can enforce exact Origin/Host equality through this proxy.
  changeOrigin: false,
  // Vite's 120-second default can expire before the API's roughly 150-second
  // OpenAI image timeout and its validation/storage margin. Keep the proxy alive
  // long enough to receive the API's structured response instead of orphaning a job.
  proxyTimeout: DEVELOPMENT_API_PROXY_TIMEOUT_MS,
} as const;

export const DEVELOPMENT_OPTIMIZE_DEPS = {
  // The voice remuxer loads MediaBunny only after a take is converted. Without
  // an explicit include, Vite can discover and optimize it at that late point,
  // invalidating the browser's in-flight module URL with a 504 Outdated
  // Optimize Dep response. optimizeDeps is development-only, so the runtime
  // import remains code-split in production.
  include: ['mediabunny'],
};

const productionSeamGuard = (): Plugin => ({
  name: 'lightframe-production-seam-guard',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && output.code.includes(DEVELOPMENT_SEAM_SENTINEL)) {
        this.error(`Production chunk ${output.fileName} contains a development-only seam.`);
      }
    }
  },
});

const repositoryCharacterFlowRollout = (): string => {
  const processValue = process.env.VITE_CHARACTER_FLOW_ROLLOUT?.trim();
  if (processValue) return processValue;
  try {
    const source = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    const assignment = source.match(/^\s*VITE_CHARACTER_FLOW_ROLLOUT\s*=\s*(.*?)\s*$/mu)?.[1];
    if (!assignment) return '';
    const value = assignment.replace(/\s+#.*$/u, '').trim();
    return /^(['"]).*\1$/u.test(value) ? value.slice(1, -1) : value;
  } catch {
    return '';
  }
};

export default defineConfig(() => {
  // Read only this public feature flag from the repository-level .env. Vite's
  // general env loader would also honor that file's server-side NODE_ENV.
  return {
    define: {
      'import.meta.env.VITE_CHARACTER_FLOW_ROLLOUT': JSON.stringify(
        repositoryCharacterFlowRollout(),
      ),
    },
    plugins: [react({ jsxImportSource: '@emotion/react' }), productionSeamGuard()],
    resolve: {
      alias: {
        '@studio/domain': `${rootPath}/packages/domain/src/index.ts`,
        '@studio/contracts': `${rootPath}/packages/contracts/src/index.ts`,
      },
    },
    optimizeDeps: DEVELOPMENT_OPTIMIZE_DEPS,
    server: {
      proxy: { '/api': DEVELOPMENT_API_PROXY },
    },
    build: { sourcemap: false },
  };
});
