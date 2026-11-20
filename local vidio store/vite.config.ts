import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, '../DanceEcho Server');
const HEALTH_URL = 'http://127.0.0.1:8090/api/v1/health';

async function isLocalServerUp(timeoutMs = 800): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 开发模式下自动拉起本地服务端（8090）。
 * 没有它时，前端照样能打开，但导入 / 播放 / 扫描会报「无法连接 DanceEcho Server」，
 * 这就是「点了启动按钮，一导入就断连」的根因：旧启动器只启动了 Vite。
 * 设 DE_NO_AUTO_SERVER=1 可关闭，改由启动脚本自行管理。
 */
function ensureLocalServer(): Plugin {
  return {
    name: 'dance-echo:ensure-local-server',
    apply: 'serve',
    async configureServer(server) {
      const logger = server.config.logger;
      if (process.env.DE_NO_AUTO_SERVER === '1') {
        logger.info('[dance-echo] DE_NO_AUTO_SERVER=1，跳过服务端自启');
        return;
      }
      if (await isLocalServerUp()) {
        logger.info('[dance-echo] 本地服务端已在运行：http://127.0.0.1:8090');
        return;
      }
      if (!existsSync(join(SERVER_DIR, 'server.mjs'))) {
        logger.warn(`[dance-echo] 未找到服务端目录：${SERVER_DIR}`);
        return;
      }
      logger.info('[dance-echo] 正在后台启动本地服务端（8090）…');
      const child = spawn(process.execPath, ['server.mjs'], {
        cwd: SERVER_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env,
      });
      child.unref();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((done) => setTimeout(done, 250));
        if (await isLocalServerUp()) {
          logger.info('[dance-echo] 本地服务端就绪：http://127.0.0.1:8090');
          return;
        }
      }
      logger.warn('[dance-echo] 服务端 10 秒内未就绪，请查看 DanceEcho Server\\data\\err.log');
    },
  };
}

export default defineConfig({
  plugins: [react(), ensureLocalServer()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // 忽略构建产物与编辑器/Agent 原子写入产生的临时目录（*.tmpdir 会导致 chokidar EBUSY 崩溃）
      ignored: [
        '**/public/wasm/**',
        '**/public/models/**',
        '**/*.wasm',
        '**/*.task',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/.*.tmpdir/**',
      ],
    },
    proxy: {
      // AI 供应商代理（浏览器直连第三方 LLM 会被 CORS 拦截，开发模式经本地转发）
      '/api/llm/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm\/deepseek/, ''),
      },
      '/api/llm/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm\/openai/, ''),
      },
      '/api/music/search': {
        target: 'https://music.163.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/music\/search/, '/api/cloudsearch/pc'),
        headers: {
          Referer: 'https://music.163.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'vendor-three';
            }
            if (id.includes('@mediapipe')) {
              return 'vendor-ai';
            }
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            return 'vendor-misc';
          }
        }
      }
    }
  }
});
