import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dance Echo - UI/UX 重构设计样图</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    :root {
      --accent-color: #06b6d4;
      --accent-subtle: rgba(6, 182, 212, 0.12);
      --accent-glow: rgba(6, 182, 212, 0.25);
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #09090b;
      color: #f4f4f5;
      overflow-x: hidden;
    }

    /* 细腻的 1px 微边界 */
    .subtle-border {
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .subtle-border-hover:hover {
      border-color: rgba(255, 255, 255, 0.16);
    }
    
    /* 护眼暗黑多层阴影 */
    .eye-shadow {
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.05);
    }

    /* 自定义细滚动条 */
    ::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
    }
  </style>
</head>
<body class="bg-[#09090b] text-[#f4f4f5] antialiased selection:bg-cyan-500/20 selection:text-cyan-200">

  <!-- ==================== VIEW CONTAINER ==================== -->
  <div id="app-root" class="min-h-screen w-full flex flex-col">

    <!-- TAB SWITCHER HEADER (用于预览两个核心视图) -->
    <header class="h-12 border-b border-white/[0.08] bg-[#0c0d10] px-6 flex items-center justify-between z-50">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-cyan-300 flex items-center justify-center shadow-sm">
            <svg class="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <span class="text-sm font-semibold tracking-tight text-white">Dance Echo</span>
          <span class="text-[11px] font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.06]">UI/UX 重构效果提案</span>
        </div>
      </div>

      <!-- VIEW SELECTOR BUTTONS -->
      <div class="flex items-center gap-1 bg-[#14151a] p-1 rounded-lg border border-white/[0.06]">
        <button id="tab-gallery-btn" onclick="showView('gallery')" class="px-3.5 py-1 text-xs font-medium rounded-md transition-all bg-zinc-800 text-white shadow-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          样图一：主媒体库与三栏工作台
        </button>
        <button id="tab-player-btn" onclick="showView('player')" class="px-3.5 py-1 text-xs font-medium rounded-md transition-all text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          样图二：沉浸式播放器与脚部避让 HUD
        </button>
      </div>

      <!-- ACCENT COLOR BADGE -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-400">护眼强调色:</span>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-cyan-400 ring-2 ring-cyan-400/30 cursor-pointer" title="清泉青 (当前)"></span>
          <span class="w-3 h-3 rounded-full bg-violet-400 hover:ring-2 ring-violet-400/30 cursor-pointer" title="星夜鸢尾"></span>
          <span class="w-3 h-3 rounded-full bg-emerald-400 hover:ring-2 ring-emerald-400/30 cursor-pointer" title="极地森林"></span>
          <span class="w-3 h-3 rounded-full bg-amber-400 hover:ring-2 ring-amber-400/30 cursor-pointer" title="日落暖珀"></span>
          <span class="w-3 h-3 rounded-full bg-zinc-300 hover:ring-2 ring-zinc-300/30 cursor-pointer" title="极简钛银"></span>
        </div>
      </div>
    </header>

    <!-- ============================================================== -->
    <!-- VIEW 1: 主媒体库与工作台 (三栏结构 + 渐进式卡片 + 右侧洞察展开栏) -->
    <!-- ============================================================== -->
    <div id="view-gallery" class="flex-1 flex overflow-hidden">
      
      <!-- 1. 左侧轻量导航栏 (纯净资产树 + 单组导入聚合) -->
      <aside class="w-64 bg-[#0d0e12] border-r border-white/[0.06] flex flex-col justify-between select-none">
        <div class="p-4 flex flex-col gap-4">
          
          <!-- 动作聚合胶囊：一键下发挂载、导入或演示 -->
          <div class="relative">
            <button class="w-full h-9 bg-zinc-800/90 hover:bg-zinc-700/90 text-white rounded-lg px-3 flex items-center justify-between subtle-border shadow-sm transition-all text-xs font-medium group">
              <span class="flex items-center gap-2">
                <span class="w-4 h-4 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm leading-none">+</span>
                <span>导入与挂载本地视频</span>
              </span>
              <svg class="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>

          <!-- 导航组 1：快速访问 -->
          <div>
            <div class="px-2 pb-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">快速访问</div>
            <nav class="flex flex-col gap-0.5">
              <a href="#" class="h-8 px-2.5 rounded-md bg-white/[0.06] text-white flex items-center justify-between text-xs font-medium subtle-border border-transparent">
                <span class="flex items-center gap-2.5">
                  <svg class="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  全部视频
                </span>
                <span class="text-[11px] text-zinc-400 font-mono">3</span>
              </a>
              <a href="#" class="h-8 px-2.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
                <span class="flex items-center gap-2.5">
                  <svg class="w-4 h-4 text-amber-400/80" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  标星精选
                </span>
                <span class="text-[11px] text-zinc-500 font-mono">3</span>
              </a>
              <a href="#" class="h-8 px-2.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
                <span class="flex items-center gap-2.5">
                  <svg class="w-4 h-4 text-purple-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                  动作打点与标记
                </span>
                <span class="text-[11px] text-zinc-500 font-mono">2</span>
              </a>
              <a href="#" class="h-8 px-2.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] flex items-center justify-between text-xs transition">
                <span class="flex items-center gap-2.5">
                  <svg class="w-4 h-4 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                  歌曲曲库
                </span>
                <span class="text-[11px] text-zinc-500 font-mono">2</span>
              </a>
            </nav>
          </div>

          <!-- 导航组 2：文件夹目录树 -->
          <div>
            <div class="px-2 pb-1.5 flex items-center justify-between text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              <span>文件夹目录</span>
              <button class="hover:text-zinc-300 transition" title="新建文件夹">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
            <div class="flex flex-col gap-0.5">
              <div class="h-7 px-2.5 rounded-md bg-white/[0.03] text-zinc-200 flex items-center justify-between text-xs cursor-pointer">
                <span class="flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  <svg class="w-4 h-4 text-amber-300/80" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  <span>本地练习总库</span>
                </span>
                <span class="text-[10px] text-zinc-500">3</span>
              </div>
              <!-- 子目录 -->
              <div class="pl-6 flex flex-col gap-0.5 border-l border-white/[0.04] ml-3.5">
                <div class="h-7 px-2 rounded-md hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition">
                  <span class="flex items-center gap-2">
                    <svg class="w-3.5 h-3.5 text-amber-200/60" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    <span>现代街舞示范</span>
                  </span>
                  <span class="text-[10px] text-zinc-500">1</span>
                </div>
                <div class="h-7 px-2 rounded-md hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition">
                  <span class="flex items-center gap-2">
                    <svg class="w-3.5 h-3.5 text-amber-200/60" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    <span>编舞慢速拆解</span>
                  </span>
                  <span class="text-[10px] text-zinc-500">2</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 导航组 3：舞种标签过滤 -->
          <div>
            <div class="px-2 pb-1.5 flex items-center justify-between text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              <span>舞种标签库</span>
              <span class="text-[10px] text-cyan-400/80 cursor-pointer hover:underline">管理</span>
            </div>
            <div class="flex flex-wrap gap-1.5 px-1 pt-1">
              <span class="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] cursor-pointer transition subtle-border">#K-Pop</span>
              <span class="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] cursor-pointer transition subtle-border">#Hip-Hop</span>
              <span class="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] cursor-pointer transition subtle-border">#Urban</span>
              <span class="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] cursor-pointer transition subtle-border">#齐舞</span>
            </div>
          </div>

        </div>

        <!-- 侧栏底部微状态 -->
        <div class="p-3 border-t border-white/[0.06] bg-[#0a0a0d] flex items-center justify-between text-xs text-zinc-500">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span class="text-[11px]">纯本地离线引擎就绪</span>
          </div>
          <button class="p-1 hover:text-zinc-300 transition" title="偏好设置">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
        </div>
      </aside>

      <!-- 2. 中间主工作画廊 (留白网格 + 单行顶栏 + 渐进式卡片) -->
      <main class="flex-1 flex flex-col min-w-0 bg-[#09090b]">
        
        <!-- 顶栏整合控制中枢 (单行聚合所有入口) -->
        <div class="h-14 border-b border-white/[0.06] px-6 flex items-center justify-between gap-4 bg-[#09090b]">
          
          <!-- 面包屑路径 -->
          <div class="flex items-center gap-2 text-xs text-zinc-400 flex-shrink-0">
            <span class="hover:text-zinc-200 cursor-pointer flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              媒体库全部
            </span>
            <span class="text-zinc-600">/</span>
            <span class="text-zinc-200 font-medium">全部视频 (3)</span>
          </div>

          <!-- 搜索胶囊中枢 -->
          <div class="flex-1 max-w-md relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <input type="text" placeholder="搜索动作、舞种或视频名称..." class="w-full h-8 pl-8 pr-12 text-xs bg-[#14151a] subtle-border rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 transition">
            <div class="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
              <kbd class="text-[10px] bg-white/[0.06] text-zinc-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </div>
          </div>

          <!-- 右侧工具岛 -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <button class="h-8 px-2.5 rounded-lg bg-[#14151a] subtle-border text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition">
              <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
              <span>最近修改</span>
            </button>
            <button class="h-8 px-2.5 rounded-lg bg-[#14151a] subtle-border text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition">
              <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <span>批量管理</span>
            </button>
            <!-- 触发右侧抽屉按钮 -->
            <button class="h-8 px-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1.5 font-medium transition shadow-sm">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>练舞洞察看板</span>
            </button>
          </div>

        </div>

        <!-- 画廊内容滚动区 -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          
          <!-- 轻量过滤胶囊条 -->
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-pointer">全部舞曲 (3)</span>
            <span class="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border border-white/[0.04] hover:border-white/[0.08] cursor-pointer transition">K-Pop (2)</span>
            <span class="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border border-white/[0.04] hover:border-white/[0.08] cursor-pointer transition">Hip-Hop (1)</span>
            <span class="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border border-white/[0.04] hover:border-white/[0.08] cursor-pointer transition">Urban (1)</span>
          </div>

          <!-- 视频卡片三列大呼吸感网格 (留白大气 · 渐进式呈现) -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <!-- 卡片 1 (Hover 活跃展示态) -->
            <div class="group relative bg-[#111216] rounded-xl overflow-hidden border border-cyan-500/40 shadow-lg shadow-cyan-950/20 transition-all duration-300 cursor-pointer">
              <!-- 封面容器 -->
              <div class="relative aspect-video bg-black/60 overflow-hidden">
                <!-- 示意舞蹈背景 -->
                <div class="w-full h-full bg-gradient-to-tr from-cyan-950/40 via-zinc-900 to-zinc-950 flex items-center justify-center relative">
                  <!-- 模拟 2D 骨骼发光微线 -->
                  <svg class="w-24 h-24 text-cyan-400/80 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="50" cy="20" r="7" stroke-width="2"/>
                    <line x1="50" y1="27" x2="50" y2="55"/>
                    <line x1="50" y1="35" x2="30" y2="45"/>
                    <line x1="50" y1="35" x2="70" y2="30"/>
                    <line x1="50" y1="55" x2="35" y2="85"/>
                    <line x1="50" y1="55" x2="65" y2="85"/>
                  </svg>
                  <!-- 模拟擦除指示微光线 (Hover Scrubbing) -->
                  <div class="absolute bottom-0 inset-x-0 h-1 bg-white/[0.1]">
                    <div class="h-full bg-cyan-400 w-2/5 shadow-[0_0_8px_#06b6d4]"></div>
                  </div>
                </div>

                <!-- 浮标：时长与打点 -->
                <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-zinc-300 border border-white/10">00:21.1</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 backdrop-blur-md border border-purple-500/30">2 打点</span>
                </div>

                <!-- 快捷操作悬浮浮岛 (Hover 渐现) -->
                <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                  <button class="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md text-amber-400 hover:scale-105 transition flex items-center justify-center border border-white/10" title="标星">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  </button>
                  <button class="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md text-zinc-300 hover:text-white hover:scale-105 transition flex items-center justify-center border border-white/10">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
                  </button>
                </div>
              </div>

              <!-- 卡片信息区 (留白呼吸、层级分明) -->
              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="text-sm font-medium text-white truncate group-hover:text-cyan-300 transition">aespa - Supernova (舞台动作拆解)</h3>
                  <span class="text-[11px] font-medium text-amber-400/90 flex items-center gap-0.5 flex-shrink-0">
                    ★ 4.9
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs text-zinc-400">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">124 BPM</span>
                    <span class="text-zinc-500 text-[11px]">K-Pop</span>
                  </div>
                  <span class="text-[11px] text-zinc-500 font-mono">3.2 MB · 刚刚</span>
                </div>
              </div>
            </div>

            <!-- 卡片 2 (常态干净留白) -->
            <div class="group relative bg-[#111216] rounded-xl overflow-hidden subtle-border subtle-border-hover transition-all duration-300 cursor-pointer">
              <div class="relative aspect-video bg-black/60 overflow-hidden">
                <div class="w-full h-full bg-gradient-to-tr from-purple-950/30 via-zinc-900 to-zinc-950 flex items-center justify-center relative">
                  <svg class="w-24 h-24 text-purple-400/60" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="50" cy="20" r="7" stroke-width="2"/>
                    <line x1="50" y1="27" x2="50" y2="55"/>
                    <line x1="50" y1="35" x2="25" y2="40"/>
                    <line x1="50" y1="35" x2="75" y2="40"/>
                    <line x1="50" y1="55" x2="40" y2="85"/>
                    <line x1="50" y1="55" x2="60" y2="85"/>
                  </svg>
                </div>
                <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-zinc-300 border border-white/10">02:50.0</span>
                </div>
              </div>
              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition">NewJeans - Super Shy (个人练习机位 B)</h3>
                  <span class="text-[11px] font-medium text-amber-400/90 flex items-center gap-0.5 flex-shrink-0">★ 4.8</span>
                </div>
                <div class="flex items-center justify-between text-xs text-zinc-400">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-zinc-300 border border-white/[0.06] font-mono">150 BPM</span>
                    <span class="text-zinc-500 text-[11px]">K-Pop</span>
                  </div>
                  <span class="text-[11px] text-zinc-500 font-mono">0.3 MB · 昨天</span>
                </div>
              </div>
            </div>

            <!-- 卡片 3 (常态干净留白) -->
            <div class="group relative bg-[#111216] rounded-xl overflow-hidden subtle-border subtle-border-hover transition-all duration-300 cursor-pointer">
              <div class="relative aspect-video bg-black/60 overflow-hidden">
                <div class="w-full h-full bg-gradient-to-tr from-emerald-950/30 via-zinc-900 to-zinc-950 flex items-center justify-center relative">
                  <svg class="w-24 h-24 text-emerald-400/60" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="50" cy="20" r="7" stroke-width="2"/>
                    <line x1="50" y1="27" x2="50" y2="55"/>
                    <line x1="50" y1="35" x2="35" y2="25"/>
                    <line x1="50" y1="35" x2="65" y2="45"/>
                    <line x1="50" y1="55" x2="35" y2="85"/>
                    <line x1="50" y1="55" x2="70" y2="80"/>
                  </svg>
                </div>
                <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-zinc-300 border border-white/10">01:45.0</span>
                </div>
              </div>
              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition">1MILLION - 官方编舞教学精修版</h3>
                  <span class="text-[11px] font-medium text-amber-400/90 flex items-center gap-0.5 flex-shrink-0">★ 5.0</span>
                </div>
                <div class="flex items-center justify-between text-xs text-zinc-400">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-zinc-300 border border-white/[0.06] font-mono">118 BPM</span>
                    <span class="text-zinc-500 text-[11px]">Urban</span>
                  </div>
                  <span class="text-[11px] text-zinc-500 font-mono">5.1 MB · 3天前</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>

      <!-- 3. 右侧展开洞察抽屉 (热力图打卡 + 成长数据 + AI 伴伴) -->
      <aside class="w-80 bg-[#0d0e12] border-l border-white/[0.06] flex flex-col justify-between">
        <div class="p-5 space-y-6 overflow-y-auto">
          
          <!-- 标题与折叠 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <h2 class="text-sm font-semibold text-white">练舞洞察与成长</h2>
            </div>
            <button class="p-1 rounded text-zinc-500 hover:text-zinc-300 transition" title="收起抽屉">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- 模块 1：热力图与打卡指标 -->
          <div class="bg-[#121318] p-4 rounded-xl subtle-border space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-zinc-400">练习打卡活跃度</span>
              <span class="text-xs text-amber-400 font-mono flex items-center gap-1">
                <span>🔥</span>
                <span>连续 5 天</span>
              </span>
            </div>
            <!-- GitHub 风格极简点阵热力图 (护眼低饱和绿) -->
            <div class="grid grid-cols-7 gap-1.5 pt-1">
              <div class="w-full aspect-square rounded-sm bg-white/[0.05]"></div>
              <div class="w-full aspect-square rounded-sm bg-emerald-500/30"></div>
              <div class="w-full aspect-square rounded-sm bg-emerald-500/60"></div>
              <div class="w-full aspect-square rounded-sm bg-emerald-500/40"></div>
              <div class="w-full aspect-square rounded-sm bg-emerald-500/80"></div>
              <div class="w-full aspect-square rounded-sm bg-emerald-500"></div>
              <div class="w-full aspect-square rounded-sm bg-cyan-400 ring-2 ring-cyan-400/30"></div>
            </div>
            <div class="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span>本周练习: 4.8 小时</span>
              <span class="hover:text-zinc-300 cursor-pointer">完整看板 →</span>
            </div>
          </div>

          <!-- 模块 2：最近动作打点速查 -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-zinc-400">最近标记动作点</div>
            <div class="space-y-1.5">
              <div class="p-2.5 rounded-lg bg-[#121318] subtle-border hover:border-white/10 transition cursor-pointer">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-200 font-medium truncate">副歌第一小节爆发步</span>
                  <span class="text-purple-400 font-mono text-[11px]">00:15.2</span>
                </div>
                <div class="text-[11px] text-zinc-500 mt-1">重心压低，左腕外展滞空半拍</div>
              </div>
              <div class="p-2.5 rounded-lg bg-[#121318] subtle-border hover:border-white/10 transition cursor-pointer">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-200 font-medium truncate">转身滑步与脚踝卡点</span>
                  <span class="text-purple-400 font-mono text-[11px]">00:28.4</span>
                </div>
                <div class="text-[11px] text-zinc-500 mt-1">切右脚脚尖内扣</div>
              </div>
            </div>
          </div>

          <!-- 模块 3：AI 舞蹈朋友快捷卡片 -->
          <div class="p-4 rounded-xl bg-gradient-to-br from-cyan-950/30 to-purple-950/20 border border-cyan-500/20 space-y-2.5">
            <div class="flex items-center gap-2">
              <span class="text-sm">✨</span>
              <span class="text-xs font-medium text-white">舞蹈朋友 (AI 伴伴)</span>
            </div>
            <p class="text-xs text-zinc-400 leading-relaxed">
              遇到节奏跟不上或动作不稳？我可以帮您逐帧拆解发力连线。
            </p>
            <button class="w-full h-8 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-medium rounded-lg border border-cyan-500/30 transition">
              开启动作对话拆解
            </button>
          </div>

        </div>

        <div class="p-3 border-t border-white/[0.06] text-[11px] text-zinc-500 text-center">
          Dance Echo · 专业舞者人机工程模型
        </div>
      </aside>

    </div>

    <!-- ============================================================== -->
    <!-- VIEW 2: 沉浸式专业舞蹈分析播放器 (超薄脚部避让 HUD + 8拍微律动) -->
    <!-- ============================================================== -->
    <div id="view-player" class="flex-1 flex flex-col bg-black overflow-hidden hidden relative">
      
      <!-- 播放器顶栏整合工具岛 -->
      <header class="h-14 border-b border-white/[0.08] bg-[#09090b]/80 backdrop-blur-md px-6 flex items-center justify-between z-30">
        <!-- 左侧：返回与视频信息 -->
        <div class="flex items-center gap-3">
          <button onclick="showView('gallery')" class="h-8 px-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1.5 transition border border-white/10">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            <span>返回媒体库</span>
          </button>
          <div class="h-4 w-[1px] bg-white/10"></div>
          <div>
            <span class="text-sm font-medium text-white">aespa - Supernova (舞台动作拆解)</span>
            <span class="ml-2 text-xs text-zinc-400 font-mono">00:15.2 / 03:24.0</span>
          </div>
        </div>

        <!-- 中间：单组紧凑视窗模式流转胶囊 -->
        <div class="flex items-center bg-[#14151a] p-1 rounded-lg border border-white/[0.08]">
          <button class="px-3 py-1 text-xs rounded-md text-zinc-400 hover:text-zinc-200">2D 原画与骨骼</button>
          <button class="px-3 py-1 text-xs rounded-md bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/30 shadow-sm flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            3D 空间骨架分屏
          </button>
          <button class="px-3 py-1 text-xs rounded-md text-zinc-400 hover:text-zinc-200">画中画 (PIP)</button>
        </div>

        <!-- 右侧：精炼工具岛 -->
        <div class="flex items-center gap-2">
          <button class="h-8 px-3 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-300 flex items-center gap-1.5 border border-white/10 transition">
            <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            <span>识别曲目</span>
          </button>
          <button class="h-8 px-3 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-300 flex items-center gap-1.5 border border-white/10 transition">
            <svg class="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
            <span>打点与笔记 (2)</span>
          </button>
          <button class="h-8 w-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center border border-white/10 transition" title="全屏 (F)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
          </button>
        </div>
      </header>

      <!-- 双视窗对比工作台 (纯净无内部杂乱标签干扰) -->
      <div class="flex-1 grid grid-cols-2 gap-2 p-3 bg-[#070709] relative">
        
        <!-- 左视窗：原画视频 + 2D 发光骨骼微连线 -->
        <div class="relative bg-zinc-950 rounded-xl overflow-hidden subtle-border flex items-center justify-center">
          <div class="text-center space-y-3">
            <!-- 模拟真实舞者画面 -->
            <div class="w-48 h-72 mx-auto relative flex items-center justify-center">
              <svg class="w-full h-full text-cyan-400" viewBox="0 0 100 160" fill="none">
                <!-- 头部 -->
                <circle cx="50" cy="24" r="10" stroke="#fff" stroke-width="2.5" fill="rgba(255,255,255,0.1)"/>
                <!-- 中轴躯干 -->
                <line x1="50" y1="34" x2="50" y2="85" stroke="#fff" stroke-width="3"/>
                <!-- 左半身 (清泉青 #06b6d4) -->
                <line x1="50" y1="45" x2="25" y2="60" stroke="#06b6d4" stroke-width="3"/>
                <line x1="25" y1="60" x2="18" y2="90" stroke="#06b6d4" stroke-width="3"/>
                <line x1="50" y1="85" x2="30" y2="120" stroke="#06b6d4" stroke-width="3"/>
                <line x1="30" y1="120" x2="20" y2="152" stroke="#06b6d4" stroke-width="3"/>
                <!-- 右半身 (珊瑚粉 #fb7185) -->
                <line x1="50" y1="45" x2="75" y2="40" stroke="#fb7185" stroke-width="3"/>
                <line x1="75" y1="40" x2="88" y2="25" stroke="#fb7185" stroke-width="3"/>
                <line x1="50" y1="85" x2="68" y2="115" stroke="#fb7185" stroke-width="3"/>
                <line x1="68" y1="115" x2="80" y2="152" stroke="#fb7185" stroke-width="3"/>
                <!-- 关键关节圆点 -->
                <circle cx="25" cy="60" r="3" fill="#06b6d4"/>
                <circle cx="18" cy="90" r="3" fill="#06b6d4"/>
                <circle cx="75" cy="40" r="3" fill="#fb7185"/>
                <circle cx="88" cy="25" r="3" fill="#fb7185"/>
              </svg>
            </div>
          </div>
          <!-- 左上角极轻量视窗标识 (不遮挡画面) -->
          <span class="absolute top-3 left-3 text-[11px] font-medium px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-zinc-400 border border-white/10">原舞步画面 · 2D 骨骼估算</span>
        </div>

        <!-- 右视窗：3D 角色同步空间 -->
        <div class="relative bg-[#0c0d12] rounded-xl overflow-hidden subtle-border flex items-center justify-center">
          <!-- 3D 虚拟舞者与透视网格 -->
          <div class="relative w-full h-full flex items-center justify-center">
            <!-- 模拟透视网格地板 -->
            <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-cyan-950/20 to-transparent flex items-end justify-center">
              <div class="w-full h-32 border-t border-cyan-500/20" style="background-image: linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px); background-size: 32px 32px; transform: perspective(300px) rotateX(60deg);"></div>
            </div>
            <!-- 3D 骨架渲染 -->
            <div class="w-48 h-72 relative flex items-center justify-center z-10">
              <svg class="w-full h-full text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.5)]" viewBox="0 0 100 160" fill="none">
                <circle cx="50" cy="24" r="10" stroke="#22d3ee" stroke-width="2.5" fill="rgba(34,211,238,0.2)"/>
                <line x1="50" y1="34" x2="50" y2="85" stroke="#22d3ee" stroke-width="2.5"/>
                <line x1="50" y1="45" x2="25" y2="60" stroke="#22d3ee" stroke-width="2.5"/>
                <line x1="25" y1="60" x2="18" y2="90" stroke="#22d3ee" stroke-width="2.5"/>
                <line x1="50" y1="45" x2="75" y2="40" stroke="#fb7185" stroke-width="2.5"/>
                <line x1="75" y1="40" x2="88" y2="25" stroke="#fb7185" stroke-width="2.5"/>
                <line x1="50" y1="85" x2="30" y2="120" stroke="#22d3ee" stroke-width="2.5"/>
                <line x1="30" y1="120" x2="20" y2="152" stroke="#22d3ee" stroke-width="2.5"/>
                <line x1="50" y1="85" x2="68" y2="115" stroke="#fb7185" stroke-width="2.5"/>
                <line x1="68" y1="115" x2="80" y2="152" stroke="#fb7185" stroke-width="2.5"/>
              </svg>
            </div>
          </div>
          <!-- 右上角极简重置视角按钮 -->
          <div class="absolute top-3 right-3 flex items-center gap-2">
            <span class="text-[11px] font-medium px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-zinc-400 border border-white/10">3D 空间角色视角</span>
            <button class="h-6 px-2 rounded bg-black/60 backdrop-blur-md text-zinc-300 hover:text-white text-[11px] flex items-center gap-1 border border-white/10 transition">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <span>居中复位</span>
            </button>
          </div>
        </div>

      </div>

      <!-- ============================================================== -->
      <!-- 核心人机工程学革新：超薄悬浮胶囊 HUD (脚部完全避让零遮挡！) -->
      <!-- ============================================================== -->
      <div class="absolute bottom-6 inset-x-0 flex flex-col items-center justify-center px-6 pointer-events-none z-40">
        
        <!-- 控制胶囊主体 (高质感磨砂微浮岛) -->
        <div class="w-full max-w-4xl bg-[#121318]/90 backdrop-blur-xl border border-white/[0.12] rounded-2xl p-3 shadow-2xl pointer-events-auto space-y-2">
          
          <!-- 进度条与 8 拍微脉冲律动带 -->
          <div class="space-y-1">
            <div class="relative h-2 w-full bg-white/[0.08] rounded-full overflow-hidden cursor-pointer group">
              <!-- 缓冲与播放条 -->
              <div class="h-full bg-cyan-400 rounded-full relative" style="width: 32%;">
                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition"></div>
              </div>
            </div>
            
            <!-- 8 拍呼吸律动指示点 (直接伴随进度条，消除多余遮挡) -->
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-cyan-400 font-mono font-semibold">拍点:</span>
                <!-- 8 拍脉冲指示灯 -->
                <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4] flex items-center justify-center text-[8px] font-bold text-black">1</span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
                <span class="w-2 h-2 rounded-full bg-purple-400/80"></span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
                <span class="w-2 h-2 rounded-full bg-white/20"></span>
              </div>
              <div class="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                <span>00:15.2</span>
                <span class="text-zinc-600">/</span>
                <span>03:24.0</span>
              </div>
            </div>
          </div>

          <!-- 控制按钮超薄行 -->
          <div class="flex items-center justify-between pt-1">
            
            <!-- 左组：主播放控制 -->
            <div class="flex items-center gap-2">
              <button class="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center shadow transition hover:scale-105">
                <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <button class="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-200 flex items-center gap-1 transition">
                <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                <span>镜像 (M)</span>
              </button>
              <button class="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-1 transition">
                <span>A-B 循环 (00:12 - 00:28)</span>
              </button>
            </div>

            <!-- 中组：专业倍速与节拍器 -->
            <div class="flex items-center gap-2">
              <!-- 倍速胶囊 -->
              <div class="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs">
                <button class="px-2 py-0.5 rounded text-zinc-400 hover:text-white">0.5x</button>
                <button class="px-2 py-0.5 rounded bg-white/20 text-white font-medium">0.75x</button>
                <button class="px-2 py-0.5 rounded text-zinc-400 hover:text-white">1.0x</button>
              </div>

              <!-- 8 拍卡点节拍微调 -->
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-zinc-200">
                <span class="text-cyan-400 font-mono font-medium">124 BPM</span>
                <span class="text-zinc-600">|</span>
                <span class="text-[10px] text-zinc-400">偏移 +0.05s</span>
              </div>
            </div>

            <!-- 右组：音量与辅助开关 -->
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                <div class="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div class="w-3/4 h-full bg-zinc-200"></div>
                </div>
              </div>
              <button class="p-1 text-zinc-400 hover:text-white transition" title="动作对比">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>

  </div>

  <script>
    function showView(view) {
      const gallery = document.getElementById('view-gallery');
      const player = document.getElementById('view-player');
      const btnGallery = document.getElementById('tab-gallery-btn');
      const btnPlayer = document.getElementById('tab-player-btn');

      if (view === 'gallery') {
        gallery.classList.remove('hidden');
        player.classList.add('hidden');
        btnGallery.classList.add('bg-zinc-800', 'text-white');
        btnGallery.classList.remove('text-zinc-400');
        btnPlayer.classList.remove('bg-zinc-800', 'text-white');
        btnPlayer.classList.add('text-zinc-400');
      } else {
        gallery.classList.add('hidden');
        player.classList.remove('hidden');
        btnPlayer.classList.add('bg-zinc-800', 'text-white');
        btnPlayer.classList.remove('text-zinc-400');
        btnGallery.classList.remove('bg-zinc-800', 'text-white');
        btnGallery.classList.add('text-zinc-400');
      }
    }
  </script>
</body>
</html>
`;

// 写出 HTML 文件
const htmlPath = path.join(__dirname, 'mockup-preview.html');
fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
console.log('HTML preview generated at:', htmlPath);

// 启动 Playwright 进行无头高分辨率截图
async function renderScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // 2x Retina 级超清清晰度
  });

  await page.goto('file:///' + htmlPath.replace(/\\\\/g, '/'));
  await page.waitForTimeout(1500);

  // 1. 截图 View 1：主工作台与媒体画廊
  const galleryScreenshotPath = path.join(__dirname, 'mockup-view1-gallery.png');
  await page.screenshot({ path: galleryScreenshotPath });
  console.log('Screenshot 1 (Gallery) captured at:', galleryScreenshotPath);

  // 2. 切换到 View 2 并截图：沉浸式专业播放器
  await page.click('#tab-player-btn');
  await page.waitForTimeout(800);
  const playerScreenshotPath = path.join(__dirname, 'mockup-view2-player.png');
  await page.screenshot({ path: playerScreenshotPath });
  console.log('Screenshot 2 (Player) captured at:', playerScreenshotPath);

  await browser.close();
}

renderScreenshots().catch(console.error);
