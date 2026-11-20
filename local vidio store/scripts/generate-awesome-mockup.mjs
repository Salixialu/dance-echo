import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取干净的真实舞者舞台画面
const pureImgPath = path.join(__dirname, 'pure-dancer-stage.jpg');
let pureStageBase64 = '';
if (fs.existsSync(pureImgPath)) {
  pureStageBase64 = 'data:image/jpeg;base64,' + fs.readFileSync(pureImgPath).toString('base64');
}

const html = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dance Echo — High Performance Dance Studio</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root {
      --accent: #00f0ff;
      --accent-subtle: rgba(0, 240, 255, 0.12);
      --accent-border: rgba(0, 240, 255, 0.35);
      --canvas: #050608;
      --surface: #0b0c10;
      --surface-elevated: #111318;
      --border-hairline: rgba(255, 255, 255, 0.07);
      --border-strong: rgba(255, 255, 255, 0.16);
    }

    * {
      box-sizing: border-box;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      background-color: var(--canvas);
      color: #f4f4f5;
      overflow-x: hidden;
    }

    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .hairline-border {
      border: 1px solid var(--border-hairline);
    }
    .hairline-border-hover:hover {
      border-color: var(--border-strong);
    }

    .glass-hud {
      background: rgba(11, 12, 16, 0.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 48px -12px rgba(0, 0, 0, 0.9);
    }

    @keyframes beatPulse {
      0%, 100% { transform: scale(1); opacity: 0.85; }
      50% { transform: scale(1.3); opacity: 1; }
    }
    .beat-pulse-active {
      animation: beatPulse 0.35s ease-out;
    }
  </style>
</head>
<body class="bg-[#050608] text-[#f4f4f5] antialiased">

  <!-- ============================================================== -->
  <!-- 顶栏全局中枢：视图流转、双语切换 (中 / EN)、强调色定制拾取器 -->
  <!-- ============================================================== -->
  <header class="h-12 border-b border-white/[0.07] bg-[#08090c] px-6 flex items-center justify-between z-50">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-white text-black flex items-center justify-center font-bold text-xs tracking-tighter shadow-sm">
          DE
        </div>
        <span class="text-xs font-semibold tracking-wider text-white uppercase">Dance Echo</span>
        <span class="text-[10px] font-mono text-zinc-500 uppercase tracking-widest pl-1">Studio Pro</span>
      </div>
    </div>

    <!-- 交互式核心视图切换 (媒体库 vs 专业播放器) -->
    <div class="flex items-center bg-[#101116] p-0.5 rounded-lg border border-white/[0.08]">
      <button id="view-tab-gallery" onclick="switchView('gallery')" class="px-3.5 py-1 text-xs font-medium rounded-md transition-all bg-white text-black font-semibold shadow flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
        <span data-i18n="tab_gallery">媒体库</span>
      </button>
      <button id="view-tab-player" onclick="switchView('player')" class="px-3.5 py-1 text-xs font-medium rounded-md transition-all text-zinc-400 hover:text-white flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span data-i18n="tab_player">专业播放器</span>
      </button>
    </div>

    <!-- 顶部右侧：语言切换器 (ZH / EN) + 强调色选择 -->
    <div class="flex items-center gap-4">
      
      <!-- 中英双语切换器 (点击即时生效) -->
      <div class="flex items-center bg-[#101116] border border-white/[0.08] p-0.5 rounded-md text-[11px] font-mono">
        <button id="lang-zh" onclick="setLanguage('zh')" class="px-2 py-0.5 rounded bg-white text-black font-semibold transition">中</button>
        <button id="lang-en" onclick="setLanguage('en')" class="px-2 py-0.5 rounded text-zinc-400 hover:text-white transition">EN</button>
      </div>

      <!-- 护眼强调色预设 -->
      <div class="flex items-center gap-1.5">
        <button onclick="setAccent('#00f0ff')" class="w-2.5 h-2.5 rounded-full bg-[#00f0ff] ring-2 ring-[#00f0ff]/40 hover:scale-125 transition" title="Aqua Cyan"></button>
        <button onclick="setAccent('#a855f7')" class="w-2.5 h-2.5 rounded-full bg-[#a855f7] hover:scale-125 transition" title="Iris Violet"></button>
        <button onclick="setAccent('#10b981')" class="w-2.5 h-2.5 rounded-full bg-[#10b981] hover:scale-125 transition" title="Emerald"></button>
        <button onclick="setAccent('#f59e0b')" class="w-2.5 h-2.5 rounded-full bg-[#f59e0b] hover:scale-125 transition" title="Amber"></button>
        <button onclick="setAccent('#ffffff')" class="w-2.5 h-2.5 rounded-full bg-[#ffffff] hover:scale-125 transition" title="Monochrome White"></button>
      </div>
    </div>
  </header>

  <!-- ============================================================== -->
  <!-- 视图 1：主工作台与媒体画廊 (0廉价感 · 摄影级画质 · 交互式微擦除) -->
  <!-- ============================================================== -->
  <div id="section-gallery" class="flex-1 flex h-[calc(100vh-48px)] overflow-hidden">
    
    <!-- 左侧极简资产侧栏 (对标 Linear / Raycast) -->
    <aside class="w-56 bg-[#07080b] border-r border-white/[0.06] flex flex-col justify-between select-none">
      <div class="p-3.5 flex flex-col gap-5">
        
        <!-- 顶级纯白 CTA 药丸 (Runway 规范：单主按钮，纯白底黑字) -->
        <button onclick="simulateImport()" class="w-full h-8 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold tracking-tight flex items-center justify-center gap-1.5 shadow transition active:scale-95">
          <svg class="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span data-i18n="btn_import">导入本地视频</span>
        </button>

        <!-- 导航分组 1: 核心资产 -->
        <div>
          <div class="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500" data-i18n="nav_library">资料库</div>
          <nav class="flex flex-col gap-0.5">
            <button class="h-7 px-2.5 rounded-md bg-white/[0.06] text-white flex items-center justify-between text-xs font-medium">
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                <span data-i18n="nav_all">全部</span>
              </span>
              <span class="text-[10px] font-mono text-zinc-400">3</span>
            </button>
            <button class="h-7 px-2.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-zinc-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                <span data-i18n="nav_favorites">标星</span>
              </span>
              <span class="text-[10px] font-mono text-zinc-500">3</span>
            </button>
            <button class="h-7 px-2.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                <span data-i18n="nav_bookmarks">打点</span>
              </span>
              <span class="text-[10px] font-mono text-zinc-500">2</span>
            </button>
            <button class="h-7 px-2.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
              <span class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                <span data-i18n="nav_tracks">曲库</span>
              </span>
              <span class="text-[10px] font-mono text-zinc-500">2</span>
            </button>
          </nav>
        </div>

        <!-- 导航分组 2: 文件夹树 (极度克制) -->
        <div>
          <div class="px-2 pb-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            <span data-i18n="nav_folders">目录树</span>
            <button class="text-zinc-500 hover:text-zinc-200 transition" title="New Folder">+</button>
          </div>
          <div class="flex flex-col gap-0.5">
            <div class="h-6 px-2.5 rounded text-xs text-zinc-300 flex items-center justify-between hover:bg-white/[0.03] cursor-pointer">
              <span class="flex items-center gap-2">
                <svg class="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                <span data-i18n="folder_root">总目录</span>
              </span>
              <span class="text-[10px] font-mono text-zinc-500">3</span>
            </div>
            <div class="pl-5 flex flex-col gap-0.5 border-l border-white/[0.04] ml-3">
              <div class="h-6 px-2 rounded text-xs text-zinc-400 hover:text-white hover:bg-white/[0.03] flex items-center justify-between cursor-pointer transition">
                <span>Choreo 编舞</span>
                <span class="text-[10px] font-mono text-zinc-500">2</span>
              </div>
              <div class="h-6 px-2 rounded text-xs text-zinc-400 hover:text-white hover:bg-white/[0.03] flex items-center justify-between cursor-pointer transition">
                <span>Freestyle 练习</span>
                <span class="text-[10px] font-mono text-zinc-500">1</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- 侧栏底部：微型引擎状态 -->
      <div class="p-3 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>OFFLINE LOCAL</span>
        </div>
        <button class="hover:text-zinc-300 transition">v0.2.0</button>
      </div>
    </aside>

    <!-- 中间主画廊 (无感边界 · 大留白 · 摄影级真实画面) -->
    <main class="flex-1 flex flex-col min-w-0 bg-[#050608]">
      
      <!-- 顶栏工具行 (单行聚合) -->
      <div class="h-12 border-b border-white/[0.06] px-6 flex items-center justify-between gap-4">
        
        <!-- 面包屑 -->
        <div class="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <span class="text-zinc-500">ROOT /</span>
          <span class="text-white font-medium" data-i18n="library_all">ALL VIDEOS (3)</span>
        </div>

        <!-- 极简命令行风格搜索栏 (Raycast 风格) -->
        <div class="w-72 relative">
          <input type="text" placeholder="Search (⌘K)..." class="w-full h-7 pl-7 pr-3 text-xs bg-[#0f1014] border border-white/[0.08] focus:border-white/30 rounded-md text-white placeholder-zinc-500 outline-none transition font-mono">
          <svg class="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>

        <!-- 右侧洞察展开开关 -->
        <div class="flex items-center gap-2">
          <button id="toggle-inspector-btn" onclick="toggleInspector()" class="h-7 px-2.5 rounded-md bg-[#0f1014] border border-white/[0.08] hover:border-white/20 text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition font-mono">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
            <span data-i18n="btn_insights">INSIGHTS</span>
          </button>
        </div>

      </div>

      <!-- 画廊内容滚动区 -->
      <div class="flex-1 overflow-y-auto p-8 space-y-6">
        
        <!-- 标签胶囊行 (单色/极简) -->
        <div class="flex items-center gap-1.5">
          <button class="px-3 py-1 rounded-full text-xs font-medium bg-white text-black font-semibold">ALL</button>
          <button class="px-3 py-1 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] transition">K-POP</button>
          <button class="px-3 py-1 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] transition">HIP-HOP</button>
          <button class="px-3 py-1 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] transition">CHOREO</button>
        </div>

        <!-- 3列摄影级大卡片 (Runway 风格，真实视频画面) -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          <!-- 卡片 1 (真实舞台舞者视频帧) -->
          <div onclick="switchView('player')" class="group relative rounded-xl overflow-hidden bg-[#0a0b0e] border border-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer shadow-xl">
            <!-- 封面与交互式微擦除 -->
            <div class="relative aspect-video bg-black overflow-hidden" onmousemove="handleCardScrub(event, this)">
              <img src="${pureStageBase64}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100" alt="Dancer">
              
              <!-- 极简磨砂浮标 -->
              <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-white border border-white/10">00:21.1</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-zinc-300 border border-white/10">124 BPM</span>
              </div>

              <!-- 悬停快捷星标 -->
              <div class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="w-6 h-6 rounded-md bg-black/80 backdrop-blur-md text-amber-400 flex items-center justify-center border border-white/10 text-xs">★</span>
              </div>

              <!-- 悬浮微擦除指示条 (Hover Scrubbing) -->
              <div class="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="card-scrub-bar h-full bg-[var(--accent)] w-1/3"></div>
              </div>
            </div>

            <!-- 卡片信息区 (极致克制) -->
            <div class="p-3.5 flex items-center justify-between">
              <div>
                <h3 class="text-xs font-semibold text-white tracking-tight group-hover:text-[var(--accent)] transition">Supernova (Choreography)</h3>
                <div class="text-[10px] font-mono text-zinc-500 mt-0.5">2 BOOKMARKS · 4.9 ★</div>
              </div>
              <span class="text-[10px] font-mono text-zinc-500">MP4</span>
            </div>
          </div>

          <!-- 卡片 2 -->
          <div onclick="switchView('player')" class="group relative rounded-xl overflow-hidden bg-[#0a0b0e] border border-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer shadow-xl">
            <div class="relative aspect-video bg-black overflow-hidden" onmousemove="handleCardScrub(event, this)">
              <img src="${pureStageBase64}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100" style="filter: hue-rotate(180deg) brightness(0.9);" alt="Dancer">
              <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-white border border-white/10">02:50.0</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-zinc-300 border border-white/10">150 BPM</span>
              </div>
              <div class="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="card-scrub-bar h-full bg-[var(--accent)] w-1/2"></div>
              </div>
            </div>
            <div class="p-3.5 flex items-center justify-between">
              <div>
                <h3 class="text-xs font-semibold text-white tracking-tight group-hover:text-[var(--accent)] transition">Super Shy (Routine B)</h3>
                <div class="text-[10px] font-mono text-zinc-500 mt-0.5">1 BOOKMARK · 4.8 ★</div>
              </div>
              <span class="text-[10px] font-mono text-zinc-500">MP4</span>
            </div>
          </div>

          <!-- 卡片 3 -->
          <div onclick="switchView('player')" class="group relative rounded-xl overflow-hidden bg-[#0a0b0e] border border-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer shadow-xl">
            <div class="relative aspect-video bg-black overflow-hidden" onmousemove="handleCardScrub(event, this)">
              <img src="${pureStageBase64}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100" style="filter: hue-rotate(90deg) brightness(0.9);" alt="Dancer">
              <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-white border border-white/10">01:45.0</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 backdrop-blur-md text-zinc-300 border border-white/10">118 BPM</span>
              </div>
              <div class="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="card-scrub-bar h-full bg-[var(--accent)] w-2/3"></div>
              </div>
            </div>
            <div class="p-3.5 flex items-center justify-between">
              <div>
                <h3 class="text-xs font-semibold text-white tracking-tight group-hover:text-[var(--accent)] transition">Urban Studio Breakdown</h3>
                <div class="text-[10px] font-mono text-zinc-500 mt-0.5">3 BOOKMARKS · 5.0 ★</div>
              </div>
              <span class="text-[10px] font-mono text-zinc-500">MOV</span>
            </div>
          </div>

        </div>

      </div>

    </main>

    <!-- 右侧检视抽屉 (对标 Figma / Linear 极简洞察) -->
    <aside id="inspector-drawer" class="w-72 bg-[#07080b] border-l border-white/[0.06] flex flex-col justify-between transition-all duration-300">
      <div class="p-4 space-y-5 overflow-y-auto">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono uppercase tracking-widest text-zinc-400" data-i18n="ins_title">PRACTICE STATS</span>
          <button onclick="toggleInspector()" class="text-zinc-500 hover:text-white text-xs">✕</button>
        </div>

        <!-- 极简打卡点阵 (GitHub/Raycast 风格低饱和绿点) -->
        <div class="p-3 rounded-lg bg-[#0e0f13] border border-white/[0.06] space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <span class="text-zinc-400 font-mono text-[10px] uppercase">Streak</span>
            <span class="text-white font-mono font-semibold">5 DAYS 🔥</span>
          </div>
          <div class="grid grid-cols-7 gap-1 pt-1">
            <div class="w-full aspect-square rounded-sm bg-white/[0.04]"></div>
            <div class="w-full aspect-square rounded-sm bg-emerald-500/30"></div>
            <div class="w-full aspect-square rounded-sm bg-emerald-500/60"></div>
            <div class="w-full aspect-square rounded-sm bg-emerald-500/40"></div>
            <div class="w-full aspect-square rounded-sm bg-emerald-500/80"></div>
            <div class="w-full aspect-square rounded-sm bg-emerald-500"></div>
            <div class="w-full aspect-square rounded-sm bg-[var(--accent)] ring-1 ring-[var(--accent)]"></div>
          </div>
          <div class="text-[10px] font-mono text-zinc-500 text-right">4.8h THIS WEEK</div>
        </div>

        <!-- 最近打点 (少字、纯粹、高交互) -->
        <div class="space-y-2">
          <div class="text-[10px] font-mono uppercase tracking-widest text-zinc-500" data-i18n="ins_bookmarks">BOOKMARKS</div>
          <div class="space-y-1">
            <div onclick="switchView('player')" class="p-2 rounded bg-[#0e0f13] border border-white/[0.06] hover:border-white/20 transition cursor-pointer flex items-center justify-between text-xs">
              <span class="text-zinc-200 truncate">Chorus Hook Drop</span>
              <span class="text-[var(--accent)] font-mono text-[10px]">00:15.2</span>
            </div>
            <div onclick="switchView('player')" class="p-2 rounded bg-[#0e0f13] border border-white/[0.06] hover:border-white/20 transition cursor-pointer flex items-center justify-between text-xs">
              <span class="text-zinc-200 truncate">Glide & Foot Plant</span>
              <span class="text-[var(--accent)] font-mono text-[10px]">00:28.4</span>
            </div>
          </div>
        </div>

        <!-- AI 伴伴极简快捷入口 -->
        <div class="p-3 rounded-lg bg-[#0e0f13] border border-white/[0.06] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs">✨</span>
            <span class="text-xs font-medium text-white">Dance Buddy</span>
          </div>
          <button class="px-2 py-1 rounded bg-white text-black text-[10px] font-semibold hover:bg-zinc-200 transition">
            ASK
          </button>
        </div>

      </div>
    </aside>

  </div>

  <!-- ============================================================== -->
  <!-- 视图 2：沉浸式专业播放器 (脚部避让 HUD · 8拍脉冲 · 2D/3D对齐) -->
  <!-- ============================================================== -->
  <div id="section-player" class="flex-1 flex flex-col h-[calc(100vh-48px)] bg-black overflow-hidden hidden relative">
    
    <!-- 顶栏精炼工具岛 -->
    <header class="h-12 border-b border-white/[0.08] bg-[#07080b]/90 backdrop-blur-xl px-6 flex items-center justify-between z-30">
      
      <!-- 返回与曲目 -->
      <div class="flex items-center gap-3">
        <button onclick="switchView('gallery')" class="h-7 px-2 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-xs text-white flex items-center gap-1 transition">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          <span data-i18n="btn_back">返回</span>
        </button>
        <span class="text-xs font-semibold text-white tracking-tight">Supernova (Choreography)</span>
        <span id="player-timecode" class="text-xs font-mono text-zinc-400">00:15.2 / 00:21.1</span>
      </div>

      <!-- 视窗模式单组微流转胶囊 -->
      <div class="flex items-center bg-[#101116] p-0.5 rounded-lg border border-white/[0.08] text-xs">
        <button id="mode-btn-2d" onclick="setPlayerMode('2d')" class="px-2.5 py-0.5 rounded text-zinc-400 hover:text-white transition">2D</button>
        <button id="mode-btn-split" onclick="setPlayerMode('split')" class="px-2.5 py-0.5 rounded bg-white text-black font-semibold shadow transition">3D SPLIT</button>
        <button id="mode-btn-pip" onclick="setPlayerMode('pip')" class="px-2.5 py-0.5 rounded text-zinc-400 hover:text-white transition">PIP</button>
      </div>

      <!-- 右侧极简工具 -->
      <div class="flex items-center gap-2">
        <button class="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs text-zinc-300 font-mono transition">
          SHAZAM 🎵
        </button>
        <button class="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs text-zinc-300 font-mono transition">
          BOOKMARKS (2)
        </button>
      </div>

    </header>

    <!-- 双视窗工作台 (真实舞者视频 + 3D 角色同步) -->
    <div id="player-viewports" class="flex-1 grid grid-cols-2 gap-2 p-2 bg-[#050608] relative">
      
      <!-- 左视窗：真实舞者视频 + 精准人体工学发光骨骼贴合 -->
      <div class="relative bg-black rounded-lg overflow-hidden border border-white/[0.08] flex items-center justify-center">
        <!-- 容器保持 16:9 与图片同宽高，确保 SVG 骨架 100% 精准对应舞者关节 -->
        <div class="relative w-full h-full flex items-center justify-center">
          <div class="relative w-full max-h-full aspect-[16/9] flex items-center justify-center">
            <img src="${pureStageBase64}" class="w-full h-full object-cover" alt="Dance Video">
            
            <!-- 精准贴合在舞者身上的生物力学骨骼线 (左青蓝 #00f0ff、右珊瑚粉 #fb7185、中轴白) -->
            <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <!-- 头部 -->
              <circle cx="49.3" cy="27.8" r="2.8" stroke="#ffffff" stroke-width="0.8" fill="rgba(255,255,255,0.15)"/>
              <!-- 躯干脊柱 -->
              <line x1="49.3" y1="30.6" x2="49.3" y2="58" stroke="#ffffff" stroke-width="0.9"/>
              <!-- 左肩与左臂 (青蓝) -->
              <line x1="49.3" y1="36" x2="44.2" y2="45" stroke="#00f0ff" stroke-width="0.9"/>
              <line x1="44.2" y1="45" x2="43.2" y2="56" stroke="#00f0ff" stroke-width="0.9"/>
              <!-- 右肩与右臂 (珊瑚粉) -->
              <line x1="49.3" y1="36" x2="54.4" y2="45" stroke="#fb7185" stroke-width="0.9"/>
              <line x1="54.4" y1="45" x2="55.2" y2="56" stroke="#fb7185" stroke-width="0.9"/>
              <!-- 左髋与左腿 (青蓝) -->
              <line x1="49.3" y1="58" x2="45.5" y2="70" stroke="#00f0ff" stroke-width="0.9"/>
              <line x1="45.5" y1="70" x2="43.0" y2="83" stroke="#00f0ff" stroke-width="0.9"/>
              <!-- 右髋与右腿 (珊瑚粉) -->
              <line x1="49.3" y1="58" x2="53.0" y2="70" stroke="#fb7185" stroke-width="0.9"/>
              <line x1="53.0" y1="70" x2="55.5" y2="83" stroke="#fb7185" stroke-width="0.9"/>
              <!-- 关节微点 -->
              <circle cx="44.2" cy="45" r="0.8" fill="#00f0ff"/>
              <circle cx="43.2" cy="56" r="0.8" fill="#00f0ff"/>
              <circle cx="54.4" cy="45" r="0.8" fill="#fb7185"/>
              <circle cx="55.2" cy="56" r="0.8" fill="#fb7185"/>
              <circle cx="43.0" cy="83" r="0.8" fill="#00f0ff"/>
              <circle cx="55.5" cy="83" r="0.8" fill="#fb7185"/>
            </svg>
          </div>
        </div>

        <span class="absolute top-2.5 left-2.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-zinc-400 border border-white/10">ORIGINAL · 2D POSE</span>
      </div>

      <!-- 右视窗：3D 角色空间 (带透视地面与视角复位) -->
      <div id="player-3d-viewport" class="relative bg-[#07080b] rounded-lg overflow-hidden border border-white/[0.08] flex items-center justify-center">
        <!-- 透视地面网格 -->
        <div class="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-cyan-950/20 to-transparent flex items-end justify-center pointer-events-none">
          <div class="w-full h-36 border-t border-cyan-500/20" style="background-image: linear-gradient(rgba(0,240,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.08) 1px, transparent 1px); background-size: 28px 28px; transform: perspective(250px) rotateX(60deg);"></div>
        </div>

        <!-- 3D 骨架模型模拟 (尺寸比例与左侧舞者严格同步) -->
        <div class="relative w-full h-full flex items-center justify-center z-10">
          <svg class="w-36 h-60 text-cyan-400 filter drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]" viewBox="0 0 100 160" fill="none">
            <circle cx="50" cy="24" r="7" stroke="#ffffff" stroke-width="1.8"/>
            <line x1="50" y1="31" x2="50" y2="78" stroke="#ffffff" stroke-width="2"/>
            <line x1="50" y1="40" x2="32" y2="54" stroke="#00f0ff" stroke-width="2"/>
            <line x1="32" y1="54" x2="26" y2="78" stroke="#00f0ff" stroke-width="2"/>
            <line x1="50" y1="40" x2="68" y2="54" stroke="#fb7185" stroke-width="2"/>
            <line x1="68" y1="54" x2="74" y2="78" stroke="#fb7185" stroke-width="2"/>
            <line x1="50" y1="78" x2="38" y2="110" stroke="#00f0ff" stroke-width="2"/>
            <line x1="38" y1="110" x2="32" y2="142" stroke="#00f0ff" stroke-width="2"/>
            <line x1="50" y1="78" x2="62" y2="110" stroke="#fb7185" stroke-width="2"/>
            <line x1="62" y1="110" x2="68" y2="142" stroke="#fb7185" stroke-width="2"/>
          </svg>
        </div>

        <!-- 居中复位微按钮 -->
        <button class="absolute top-2.5 right-2.5 h-6 px-2 rounded bg-black/70 backdrop-blur-md text-zinc-400 hover:text-white text-[10px] font-mono border border-white/10 flex items-center gap-1 transition">
          <span>RESET ORBIT</span>
        </button>
      </div>

    </div>

    <!-- ============================================================== -->
    <!-- 播放器核心革命：超薄脚部避让 HUD (脚踝力线 100% 毫无遮挡) -->
    <!-- ============================================================== -->
    <div class="absolute bottom-5 inset-x-0 flex flex-col items-center justify-center px-6 pointer-events-none z-40">
      
      <!-- 磨砂玻璃悬浮微胶囊 -->
      <div class="w-full max-w-3xl glass-hud rounded-2xl p-2.5 pointer-events-auto space-y-2">
        
        <!-- 进度条与 8 拍微脉冲对齐 -->
        <div class="space-y-1">
          <!-- 可拖拽交互时间轴 -->
          <div id="timeline-track" onclick="scrubTimeline(event)" class="relative h-1.5 w-full bg-white/10 rounded-full cursor-pointer group">
            <div id="timeline-progress" class="h-full bg-[var(--accent)] rounded-full relative" style="width: 72%;">
              <div class="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow scale-0 group-hover:scale-100 transition"></div>
            </div>
          </div>

          <!-- 8 拍微脉冲律动带 (伴随进度条，0额外遮挡) -->
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">BEAT</span>
              <div id="metronome-dots" class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-[var(--accent)] beat-pulse-active flex items-center justify-center text-[7px] font-bold text-black font-mono">1</span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-purple-400/80"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>
              </div>
            </div>
            
            <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
              <span class="text-[var(--accent)] font-semibold">124 BPM</span>
              <span class="text-zinc-600">|</span>
              <span>OFFSET +0.05s</span>
            </div>
          </div>
        </div>

        <!-- 极简控制按钮行 (单行高度仅 30px) -->
        <div class="flex items-center justify-between pt-0.5">
          
          <!-- 播放/暂停/镜像/AB循环 -->
          <div class="flex items-center gap-2">
            <button id="btn-play" onclick="togglePlay()" class="w-7 h-7 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shadow transition active:scale-90">
              <svg id="icon-play" class="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <svg id="icon-pause" class="w-3.5 h-3.5 fill-current hidden" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>

            <!-- 镜像切换 -->
            <button id="btn-mirror" onclick="toggleMirror()" class="h-6 px-2 rounded bg-white/[0.08] hover:bg-white/[0.14] text-[11px] font-mono text-white flex items-center gap-1 transition">
              <span>MIRROR (M)</span>
            </button>

            <!-- A-B 循环 -->
            <button id="btn-ab-loop" onclick="toggleLoop()" class="h-6 px-2 rounded bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[11px] font-mono text-[var(--accent)] transition">
              <span>A-B [00:12 - 00:18]</span>
            </button>
          </div>

          <!-- 倍速微调 -->
          <div class="flex items-center bg-black/40 p-0.5 rounded-md border border-white/10 text-[10px] font-mono">
            <button onclick="setSpeed(0.5)" class="px-1.5 py-0.5 rounded text-zinc-400 hover:text-white">0.5x</button>
            <button onclick="setSpeed(0.75)" class="px-1.5 py-0.5 rounded bg-white/20 text-white font-semibold">0.75x</button>
            <button onclick="setSpeed(1.0)" class="px-1.5 py-0.5 rounded text-zinc-400 hover:text-white">1.0x</button>
          </div>

          <!-- 音量与全屏 -->
          <div class="flex items-center gap-2 text-zinc-400">
            <button class="hover:text-white transition">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
            </button>
            <div class="w-14 h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer">
              <div class="w-3/4 h-full bg-white"></div>
            </div>
            <button class="hover:text-white transition" title="Fullscreen (F)">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
            </button>
          </div>

        </div>

      </div>

    </div>

  </div>

  <!-- ============================================================== -->
  <!-- 交互逻辑：国际化 (ZH/EN)、播放进度模拟、视窗流转、主题切换 -->
  <!-- ============================================================== -->
  <script>
    const i18nData = {
      zh: {
        tab_gallery: '媒体库',
        tab_player: '专业播放器',
        btn_import: '导入本地视频',
        nav_library: '资料库',
        nav_all: '全部',
        nav_favorites: '标星',
        nav_bookmarks: '打点',
        nav_tracks: '曲库',
        nav_folders: '目录树',
        folder_root: '总目录',
        library_all: '全部视频 (3)',
        btn_insights: '练舞洞察',
        ins_title: '练习统计',
        ins_bookmarks: '动作打点',
        btn_back: '返回'
      },
      en: {
        tab_gallery: 'Gallery',
        tab_player: 'Studio Player',
        btn_import: 'Import Video',
        nav_library: 'LIBRARY',
        nav_all: 'All Videos',
        nav_favorites: 'Favorites',
        nav_bookmarks: 'Bookmarks',
        nav_tracks: 'Tracks',
        nav_folders: 'FOLDERS',
        folder_root: 'Root',
        library_all: 'ALL VIDEOS (3)',
        btn_insights: 'INSIGHTS',
        ins_title: 'PRACTICE STATS',
        ins_bookmarks: 'BOOKMARKS',
        btn_back: 'BACK'
      }
    };

    let currentLang = 'zh';

    function setLanguage(lang) {
      currentLang = lang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18nData[lang] && i18nData[lang][key]) {
          el.textContent = i18nData[lang][key];
        }
      });

      const btnZh = document.getElementById('lang-zh');
      const btnEn = document.getElementById('lang-en');
      if (lang === 'zh') {
        btnZh.className = 'px-2 py-0.5 rounded bg-white text-black font-semibold transition';
        btnEn.className = 'px-2 py-0.5 rounded text-zinc-400 hover:text-white transition';
      } else {
        btnEn.className = 'px-2 py-0.5 rounded bg-white text-black font-semibold transition';
        btnZh.className = 'px-2 py-0.5 rounded text-zinc-400 hover:text-white transition';
      }
    }

    function switchView(view) {
      const g = document.getElementById('section-gallery');
      const p = document.getElementById('section-player');
      const tbG = document.getElementById('view-tab-gallery');
      const tbP = document.getElementById('view-tab-player');

      if (view === 'gallery') {
        g.classList.remove('hidden');
        p.classList.add('hidden');
        tbG.className = 'px-3.5 py-1 text-xs font-medium rounded-md transition-all bg-white text-black font-semibold shadow flex items-center gap-1.5';
        tbP.className = 'px-3.5 py-1 text-xs font-medium rounded-md transition-all text-zinc-400 hover:text-white flex items-center gap-1.5';
      } else {
        g.classList.add('hidden');
        p.classList.remove('hidden');
        tbP.className = 'px-3.5 py-1 text-xs font-medium rounded-md transition-all bg-white text-black font-semibold shadow flex items-center gap-1.5';
        tbG.className = 'px-3.5 py-1 text-xs font-medium rounded-md transition-all text-zinc-400 hover:text-white flex items-center gap-1.5';
      }
    }

    function setAccent(color) {
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-subtle', color + '1f');
      document.documentElement.style.setProperty('--accent-border', color + '59');
    }

    let isInspectorOpen = true;
    function toggleInspector() {
      const d = document.getElementById('inspector-drawer');
      isInspectorOpen = !isInspectorOpen;
      if (isInspectorOpen) {
        d.classList.remove('w-0', 'p-0', 'border-0', 'hidden');
        d.classList.add('w-72');
      } else {
        d.classList.remove('w-72');
        d.classList.add('w-0', 'p-0', 'border-0', 'hidden');
      }
    }

    let isPlaying = false;
    let playTimer = null;
    let progress = 72;

    function togglePlay() {
      isPlaying = !isPlaying;
      const iPlay = document.getElementById('icon-play');
      const iPause = document.getElementById('icon-pause');
      if (isPlaying) {
        iPlay.classList.add('hidden');
        iPause.classList.remove('hidden');
        playTimer = setInterval(() => {
          progress = (progress + 0.5) % 100;
          document.getElementById('timeline-progress').style.width = progress + '%';
        }, 100);
      } else {
        iPlay.classList.remove('hidden');
        iPause.classList.add('hidden');
        clearInterval(playTimer);
      }
    }

    function scrubTimeline(e) {
      const track = document.getElementById('timeline-track');
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      progress = pct;
      document.getElementById('timeline-progress').style.width = pct + '%';
    }

    function handleCardScrub(e, container) {
      const rect = container.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const bar = container.querySelector('.card-scrub-bar');
      if (bar) bar.style.width = pct + '%';
    }

    function setPlayerMode(mode) {
      const v3d = document.getElementById('player-3d-viewport');
      const viewports = document.getElementById('player-viewports');
      const b2d = document.getElementById('mode-btn-2d');
      const bSplit = document.getElementById('mode-btn-split');
      const bPip = document.getElementById('mode-btn-pip');

      [b2d, bSplit, bPip].forEach(b => b.className = 'px-2.5 py-0.5 rounded text-zinc-400 hover:text-white transition');

      if (mode === '2d') {
        b2d.className = 'px-2.5 py-0.5 rounded bg-white text-black font-semibold shadow transition';
        v3d.classList.add('hidden');
        viewports.className = 'flex-1 grid grid-cols-1 gap-2 p-2 bg-[#050608] relative';
      } else if (mode === 'split') {
        bSplit.className = 'px-2.5 py-0.5 rounded bg-white text-black font-semibold shadow transition';
        v3d.classList.remove('hidden');
        viewports.className = 'flex-1 grid grid-cols-2 gap-2 p-2 bg-[#050608] relative';
      } else {
        bPip.className = 'px-2.5 py-0.5 rounded bg-white text-black font-semibold shadow transition';
        v3d.classList.remove('hidden');
        viewports.className = 'flex-1 grid grid-cols-1 gap-2 p-2 bg-[#050608] relative';
        v3d.className = 'absolute bottom-24 right-6 w-80 h-52 z-20 rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-[#07080b] flex items-center justify-center';
      }
    }

    function toggleMirror() {
      const btn = document.getElementById('btn-mirror');
      btn.classList.toggle('bg-white');
      btn.classList.toggle('text-black');
    }

    function toggleLoop() {
      const btn = document.getElementById('btn-ab-loop');
      btn.classList.toggle('opacity-50');
    }

    function simulateImport() {
      alert(currentLang === 'zh' ? '已触发本地视频目录选择器' : 'Triggered local directory picker');
    }
  </script>

</body>
</html>
`;

const htmlPath = path.join(__dirname, 'mockup-awesome.html');
fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('Updated Awesome HTML written to:', htmlPath);

async function captureAwesome() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto('file:///' + htmlPath.replace(/\\\\/g, '/'));
  await page.waitForTimeout(800);

  // 1. 中文版画廊截图
  const p1 = path.join(__dirname, 'awesome-v2-gallery-zh.png');
  await page.screenshot({ path: p1 });
  console.log('1. Captured Gallery (ZH) ->', p1);

  // 2. 切换至英文版画廊截图
  await page.click('#lang-en');
  await page.waitForTimeout(400);
  const p2 = path.join(__dirname, 'awesome-v2-gallery-en.png');
  await page.screenshot({ path: p2 });
  console.log('2. Captured Gallery (EN) ->', p2);

  // 3. 切换至专业播放器 (英文版)
  await page.click('#view-tab-player');
  await page.waitForTimeout(500);
  const p3 = path.join(__dirname, 'awesome-v2-player-en.png');
  await page.screenshot({ path: p3 });
  console.log('3. Captured Player (EN) ->', p3);

  // 4. 切换回中文版播放器
  await page.click('#lang-zh');
  await page.waitForTimeout(400);
  const p4 = path.join(__dirname, 'awesome-v2-player-zh.png');
  await page.screenshot({ path: p4 });
  console.log('4. Captured Player (ZH) ->', p4);

  await browser.close();
}

captureAwesome().catch(console.error);
