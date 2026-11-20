import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8088;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.vrm': 'model/gltf-binary',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream'
};

const PATHS = {
  dist: path.join(__dirname, 'local vidio store', 'dist'),
  vidio: path.join(__dirname, 'vidio')
};

const MUSIC_UPSTREAM = 'https://music.163.com/api/cloudsearch/pc';
const MUSIC_HEADERS = {
  'Referer': 'https://music.163.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

/**
 * 网易云搜索代理。
 * 上游偶发 TLS/网络抖动，因此：超时 + 单次重试 + 校验上游状态码。
 * 上游不可用时返回「结构化的空结果」而非 502：songService 会据此平滑
 * 降级到内置曲库（见 songService.ts searchSong），不再往控制台抛 502。
 */
async function proxyMusicSearch(queryStr, res) {
  const targetUrl = `${MUSIC_UPSTREAM}${queryStr}`;
  const sendJson = (status, payload) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const upstream = await fetch(targetUrl, {
        headers: MUSIC_HEADERS,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!upstream.ok) {
        throw new Error(`upstream ${upstream.status}`);
      }
      const body = await upstream.text();
      sendJson(200, JSON.parse(body));
      return;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 0) {
        await new Promise((done) => setTimeout(done, 400));
        continue;
      }
      // 上游不可用：给前端一个合法的空结果，让它走内置曲库降级。
      console.warn('[music-proxy] 上游不可用，返回空结果以降级:', err.message);
      sendJson(200, { result: { songs: [] }, songCount: 0, code: 200 });
    }
  }
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }
  let filePath = '';

  // 全局越界防护：解码后任何含 `..` 段的请求一律拒绝，避免规范化后被
  // SPA fallback 吞成 200，也杜绝跨目录读取。
  if (urlPath.split(/[/\\]/).includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  if (urlPath === '/api/music/search') {
    const idx = req.url.indexOf('?');
    const queryStr = idx >= 0 ? req.url.substring(idx) : '';
    void proxyMusicSearch(queryStr, res);
    return;
  }

  // 早期 /mocap 原型与 /public 目录已随旧工程一并清理；命中时明确 410，
  // 避免把已删除目录当成有效映射或留下路径穿越隐患。
  if (urlPath === '/mocap' || urlPath === '/mocap/' || urlPath.startsWith('/mocap/') || urlPath.startsWith('/public/')) {
    res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('410 Gone: 早期原型入口已移除');
  } else if (urlPath.startsWith('/vidio/')) {
    const sub = path.normalize(urlPath.replace(/^\/vidio\//, ''));
    if (sub.startsWith('..') || path.isAbsolute(sub)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }
    filePath = path.join(PATHS.vidio, sub);
  } else {
    // 优先映射到生产构建目录 dist
    const distExists = fs.existsSync(PATHS.dist);
    if (distExists) {
      let safeSub = path.normalize(urlPath).replace(/^[/\\]+/, '');
      if (!safeSub) safeSub = 'index.html';
      filePath = path.resolve(PATHS.dist, safeSub);
      // 越界兜底：解析后的路径必须仍在 dist 目录内
      if (!filePath.startsWith(PATHS.dist + path.sep) && filePath !== PATHS.dist) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('403 Forbidden');
      }
      // SPA fallback
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = path.join(PATHS.dist, 'index.html');
      }
    } else {
      // 未构建 dist 时，给出友好的引导页面，指引使用 Vite 启动
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Dance Echo - 启动引导</title>
          <style>
            body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 520px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { font-size: 22px; color: #38bdf8; margin-top: 0; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; }
            .code { background: #0f172a; padding: 10px 14px; border-radius: 6px; font-family: monospace; color: #a5f3fc; margin: 12px 0; border: 1px solid #1e293b; }
            .btn { display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 500; margin-top: 10px; }
            .btn:hover { background: #0369a1; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Dance Echo 现代前端工程服务提示</h1>
            <p>Dance Echo 核心主工程基于 <strong>Vite 6 + React 19</strong> 构建，推荐使用开发服务器启动：</p>
            <div class="code">双击运行根目录: 启动DanceEcho.bat</div>
            <p>或在终端中运行：</p>
            <div class="code">cd "local vidio store"<br/>npm run dev</div>
            <p>本地开发服务地址：<a href="http://127.0.0.1:5173" style="color: #38bdf8;">http://127.0.0.1:5173</a></p>
            <a class="btn" href="http://127.0.0.1:5173" target="_blank">前往 Vite 开发服务 (5173)</a>
          </div>
        </body>
        </html>
      `);
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + urlPath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // HTTP 206 Partial Content 支持视频流平滑拖拽与分段缓冲
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('========================================================');
  console.log(`[Dance Echo 统一服务] 启动成功: http://127.0.0.1:${PORT}`);
  console.log(`- 媒体库与动作学习: http://127.0.0.1:${PORT}/`);
  console.log(`- 后端 API (DanceEcho Server): http://127.0.0.1:8090/api/v1/health`);
  console.log('========================================================');
});
