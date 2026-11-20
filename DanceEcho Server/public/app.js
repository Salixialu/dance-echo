/**
 * Dance Echo · 服务端媒体库 — 前端（原生 ES 模块，无构建）
 *
 * 缩略图策略：
 *   1. GET /thumb/:id 命中则直接用
 *   2. 404 时用隐藏 <video> 加载 /stream/:id 截第 2 秒的帧
 *   3. canvas 编码为 400×225 JPEG(0.82)，POST 回 /thumb/:id 缓存，并立即用 objectURL 显示
 */
const $ = (id) => document.getElementById(id);

const els = {
  rootPath: $('rootPath'),
  totalCount: $('totalCount'),
  totalSize: $('totalSize'),
  scannedAt: $('scannedAt'),
  searchInput: $('searchInput'),
  sortSelect: $('sortSelect'),
  rescanBtn: $('rescanBtn'),
  openAppBtn: $('openAppBtn'),
  dateTree: $('dateTree'),
  resultLabel: $('resultLabel'),
  activeFilter: $('activeFilter'),
  grid: $('grid'),
  empty: $('empty'),
  emptyText: $('emptyText'),
  clearFilterBtn: $('clearFilterBtn'),
  player: $('player'),
  playerShell: $('playerShell'),
  playerTitle: $('playerTitle'),
  playerMeta: $('playerMeta'),
  playerVideo: $('playerVideo'),
  speedSelect: $('speedSelect'),
  closePlayer: $('closePlayer'),
  progressHint: $('progressHint'),
  toast: $('toast'),
};

const state = {
  videos: [],
  root: '',
  scannedAt: null,
  query: '',
  sort: 'date-desc',
  filter: { level: 'all' },
  expanded: new Set(),
  current: null,
  lastProgressAt: 0,
  toastTimer: null,
  lastToast: { text: '', at: 0 },
};

const thumbCache = new Map(); // id -> objectURL
const thumbInflight = new Set();
let observer = null;

// ------------------------------------------------------------------ 工具

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  return formatDuration(seconds) ?? '0:00';
}

function formatDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-');
  if (!y || !m || !d) return dateKey;
  return `${y}.${m}.${d}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function showToast(message, type = 'info') {
  const now = Date.now();
  if (state.lastToast.text === message && now - state.lastToast.at < 3000) return;
  state.lastToast = { text: message, at: now };
  els.toast.textContent = message;
  els.toast.className = `toast${type === 'error' ? ' error' : ''}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 4200);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchJson(url, options) {
  const res = await fetch(url, { cache: 'no-store', ...(options ?? {}) });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`${url} → HTTP ${res.status}${detail ? `：${detail}` : ''}`);
  }
  return res.json();
}

async function patchVideo(id, patch) {
  return fetchJson(`/api/video/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ------------------------------------------------------------------ 数据加载

async function loadLibrary(force = false) {
  els.resultLabel.textContent = force ? '正在全量扫描媒体目录…' : '正在加载媒体库…';
  try {
    const data = await fetchJson(`/api/library${force ? '?force=1' : ''}`);
    state.videos = Array.isArray(data.videos) ? data.videos : [];
    state.root = data.root ?? '';
    state.scannedAt = data.scannedAt ?? null;

    els.rootPath.textContent = state.root ? `媒体根目录 · ${state.root}` : '媒体根目录未配置';
    els.totalCount.textContent = String(data.count ?? state.videos.length);
    els.totalSize.textContent = `总大小 ${formatBytes(data.totalBytes ?? 0)}`;
    els.scannedAt.textContent = state.scannedAt ? `扫描于 ${formatDateTime(state.scannedAt)}` : '—';

    if (state.expanded.size === 0 && state.videos.length > 0) {
      const [year, month] = state.videos[0].dateKey.split('-');
      state.expanded.add(`y-${year}`);
      state.expanded.add(`m-${year}-${month}`);
    }

    renderTree();
    renderGrid();
    els.empty.classList.add('hidden');
  } catch (err) {
    console.error(err);
    state.videos = [];
    renderTree();
    renderGrid();
    els.empty.classList.remove('hidden');
    els.emptyText.textContent = `媒体库加载失败：${err.message}`;
    els.resultLabel.textContent = '加载失败';
    showToast(`媒体库加载失败：${err.message}`, 'error');
  }
}

// ------------------------------------------------------------------ 日期树

function buildTreeData() {
  const years = new Map();
  for (const video of state.videos) {
    const [year, month, day] = video.dateKey.split('-');
    if (!year || !month || !day) continue;
    if (!years.has(year)) years.set(year, { count: 0, months: new Map() });
    const y = years.get(year);
    y.count += 1;
    if (!y.months.has(month)) y.months.set(month, { count: 0, days: new Map() });
    const m = y.months.get(month);
    m.count += 1;
    if (!m.days.has(day)) m.days.set(day, { count: 0, dateKey: video.dateKey });
    m.days.get(day).count += 1;
  }
  return years;
}

function isActive(filter) {
  const current = state.filter;
  if (filter.level !== current.level) return false;
  if (filter.level === 'all') return true;
  if (filter.level === 'year') return filter.year === current.year;
  if (filter.level === 'month') return filter.year === current.year && filter.month === current.month;
  if (filter.level === 'day') return filter.dateKey === current.dateKey;
  return false;
}

function makeTreeRow({ label, count, depth, filter, caretKey = null, leaf = false, allRow = false }) {
  const row = el('button', `tree-row depth-${depth}${allRow ? ' all-row' : ''}${isActive(filter) ? ' active' : ''}`);
  row.type = 'button';

  const caret = el('span', `tree-caret${leaf ? ' leaf' : ''}${caretKey && state.expanded.has(caretKey) ? ' open' : ''}`, '›');
  caret.setAttribute('aria-hidden', 'true');
  if (caretKey) {
    caret.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.expanded.has(caretKey)) state.expanded.delete(caretKey);
      else state.expanded.add(caretKey);
      renderTree();
    });
  }
  row.appendChild(caret);
  row.appendChild(el('span', 'tree-label', label));
  row.appendChild(el('span', 'tree-badge', String(count)));
  row.addEventListener('click', () => {
    state.filter = filter;
    renderTree();
    renderGrid();
  });
  return row;
}

function renderTree() {
  const years = buildTreeData();
  const fragment = document.createDocumentFragment();

  fragment.appendChild(
    makeTreeRow({
      label: '全部',
      count: state.videos.length,
      depth: 0,
      filter: { level: 'all' },
      caretKey: null,
      leaf: true,
      allRow: true,
    }),
  );

  const sortedYears = [...years.keys()].sort().reverse();
  for (const year of sortedYears) {
    const y = years.get(year);
    const yearKey = `y-${year}`;
    const open = state.expanded.has(yearKey);
    fragment.appendChild(
      makeTreeRow({
        label: `${year} 年`,
        count: y.count,
        depth: 0,
        filter: { level: 'year', year },
        caretKey: yearKey,
      }),
    );

    if (!open) continue;
    const children = el('div', 'tree-children');
    const sortedMonths = [...y.months.keys()].sort().reverse();
    for (const month of sortedMonths) {
      const m = y.months.get(month);
      const monthKey = `m-${year}-${month}`;
      const monthOpen = state.expanded.has(monthKey);
      children.appendChild(
        makeTreeRow({
          label: `${month} 月`,
          count: m.count,
          depth: 1,
          filter: { level: 'month', year, month },
          caretKey: monthKey,
        }),
      );

      if (!monthOpen) continue;
      const dayChildren = el('div', 'tree-children');
      const sortedDays = [...m.days.keys()].sort().reverse();
      for (const day of sortedDays) {
        const d = m.days.get(day);
        dayChildren.appendChild(
          makeTreeRow({
            label: `${day} 日`,
            count: d.count,
            depth: 2,
            filter: { level: 'day', dateKey: d.dateKey },
            caretKey: null,
            leaf: true,
          }),
        );
      }
      children.appendChild(dayChildren);
    }
    fragment.appendChild(children);
  }

  els.dateTree.replaceChildren(fragment);
}

// ------------------------------------------------------------------ 筛选 / 排序

function activeFilterText() {
  const f = state.filter;
  if (f.level === 'year') return `筛选：${f.year} 年`;
  if (f.level === 'month') return `筛选：${f.year} 年 ${f.month} 月`;
  if (f.level === 'day') {
    const [y, m, d] = f.dateKey.split('-');
    return `筛选：${y} 年 ${m} 月 ${d} 日`;
  }
  return '';
}

function filteredVideos() {
  const f = state.filter;
  let list = state.videos;
  if (f.level === 'year') list = list.filter((v) => v.dateKey.startsWith(`${f.year}-`));
  else if (f.level === 'month') list = list.filter((v) => v.dateKey.startsWith(`${f.year}-${f.month}-`));
  else if (f.level === 'day') list = list.filter((v) => v.dateKey === f.dateKey);

  if (state.query) {
    const q = state.query;
    list = list.filter((v) => v.name.toLowerCase().includes(q) || v.relPath.toLowerCase().includes(q));
  }

  const sorted = list.slice();
  switch (state.sort) {
    case 'date-asc':
      sorted.sort((a, b) => (a.dateKey === b.dateKey ? a.mtimeMs - b.mtimeMs : a.dateKey < b.dateKey ? -1 : 1));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
      break;
    case 'size':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'date-desc':
    default:
      sorted.sort((a, b) => (a.dateKey === b.dateKey ? b.mtimeMs - a.mtimeMs : a.dateKey < b.dateKey ? 1 : -1));
      break;
  }
  return sorted;
}

function renderGrid() {
  const list = filteredVideos();
  const totalBytes = list.reduce((sum, v) => sum + v.size, 0);

  els.resultLabel.replaceChildren(
    document.createTextNode('共 '),
    el('b', null, String(list.length)),
    document.createTextNode(` 个视频 · ${formatBytes(totalBytes)}`),
  );

  const filterText = activeFilterText();
  if (filterText) {
    const wrap = el('span', null, filterText);
    const clear = el('button', 'btn-ghost', '清除');
    clear.type = 'button';
    clear.style.padding = '2px 9px';
    clear.style.fontSize = '11px';
    clear.addEventListener('click', clearFilters);
    els.activeFilter.replaceChildren(wrap, clear);
  } else {
    els.activeFilter.replaceChildren();
  }

  observer.disconnect();
  els.grid.replaceChildren();
  if (list.length === 0) {
    els.empty.classList.remove('hidden');
    els.emptyText.textContent = state.query
      ? `没有找到与「${state.query}」匹配的视频`
      : '当前筛选条件下没有视频';
    return;
  }
  els.empty.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  for (const video of list) fragment.appendChild(createCard(video));
  els.grid.appendChild(fragment);

  for (const thumb of els.grid.querySelectorAll('.thumb')) observer.observe(thumb);
}

function createCard(video) {
  const card = el('button', 'card');
  card.type = 'button';
  card.dataset.id = video.id;
  card.title = video.relPath;

  const thumb = el('div', 'thumb');
  thumb.dataset.id = video.id;
  const placeholder = el('div', 'thumb-placeholder');
  placeholder.appendChild(el('div', 'play-glyph'));
  thumb.appendChild(placeholder);

  if (video.duration) thumb.appendChild(el('span', 'duration-badge', formatDuration(video.duration)));
  thumb.appendChild(
    el('span', 'source-badge', video.dateSource === 'creation' ? '拍摄时间' : '文件时间'),
  );

  const body = el('div', 'card-body');
  body.appendChild(el('div', 'card-name', video.name));

  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', null, formatDateKey(video.dateKey)));
  meta.appendChild(el('span', 'sep', '·'));
  meta.appendChild(el('span', 'size', formatBytes(video.size)));
  if (video.width && video.height) {
    meta.appendChild(el('span', 'sep', '·'));
    meta.appendChild(el('span', null, `${video.width}×${video.height}`));
  }
  body.appendChild(meta);

  card.appendChild(thumb);
  card.appendChild(body);
  card.addEventListener('click', () => openPlayer(video.id));

  return card;
}

function clearFilters() {
  state.filter = { level: 'all' };
  state.query = '';
  els.searchInput.value = '';
  renderTree();
  renderGrid();
}

// ------------------------------------------------------------------ 缩略图

function createLimiter(max) {
  let active = 0;
  const queue = [];
  function next() {
    if (active >= max || queue.length === 0) return;
    active += 1;
    const task = queue.shift();
    task
      .run()
      .then(task.resolve, task.reject)
      .finally(() => {
        active -= 1;
        next();
      });
  }
  return (run) =>
    new Promise((resolve, reject) => {
      queue.push({ run, resolve, reject });
      next();
    });
}

const limitCapture = createLimiter(2);

function showThumb(holder, url) {
  let img = holder.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    holder.prepend(img);
  }
  img.addEventListener(
    'load',
    () => {
      holder.classList.add('ready');
      holder.classList.remove('loading');
    },
    { once: true },
  );
  img.src = url;
}

function markThumbFailed(holder) {
  holder.classList.add('failed');
  holder.classList.remove('loading');
  const placeholder = holder.querySelector('.thumb-placeholder');
  if (placeholder) placeholder.replaceChildren(el('span', 'thumb-fallback', '无预览'));
}

function captureFrame(videoId) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.cssText =
      'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);

    let settled = false;
    let timer = 0;

    const cleanup = () => {
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    timer = setTimeout(() => fail('截帧超时（20 秒）'), 20000);
    video.addEventListener('error', () => fail('浏览器无法解码该视频，截帧失败'));

    video.addEventListener(
      'loadedmetadata',
      () => {
        const position = Math.min(2, Math.max(0.1, (video.duration || 4) * 0.2));
        try {
          video.currentTime = position;
        } catch {
          fail('无法跳到截帧位置');
        }
      },
      { once: true },
    );

    video.addEventListener(
      'seeked',
      () => {
        if (settled) return;
        try {
          const width = 400;
          const height = 225;
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);

          const vw = video.videoWidth || 16;
          const vh = video.videoHeight || 9;
          const scale = Math.max(width / vw, height / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail('截帧编码失败');
                return;
              }
              if (settled) return;
              settled = true;
              cleanup();
              resolve(blob);
            },
            'image/jpeg',
            0.82,
          );
        } catch (err) {
          fail(err.message || '截帧绘制失败');
        }
      },
      { once: true },
    );

    video.src = `/stream/${videoId}#t=2`;
    video.load();
  });
}

async function loadThumb(holder) {
  const id = holder.dataset.id;
  if (!id || holder.dataset.loaded === '1') return;
  holder.dataset.loaded = '1';
  if (thumbCache.has(id)) {
    showThumb(holder, thumbCache.get(id));
    return;
  }
  if (thumbInflight.has(id)) return;
  thumbInflight.add(id);
  holder.classList.add('loading');

  try {
    const res = await fetch(`/thumb/${id}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      thumbCache.set(id, url);
      showThumb(holder, url);
      return;
    }
    if (res.status !== 404) throw new Error(`缩略图请求失败（HTTP ${res.status}）`);

    const blob = await limitCapture(() => captureFrame(id));
    const url = URL.createObjectURL(blob);
    thumbCache.set(id, url);
    showThumb(holder, url);

    const upload = await fetch(`/thumb/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!upload.ok) throw new Error(`缩略图回传失败（HTTP ${upload.status}）`);
  } catch (err) {
    console.warn(`[thumb] ${id}:`, err.message);
    markThumbFailed(holder);
    showToast(`缩略图生成失败：${err.message}`, 'error');
  } finally {
    thumbInflight.delete(id);
    holder.classList.remove('loading');
  }
}

observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      loadThumb(entry.target);
    }
  },
  { rootMargin: '400px 0px', threshold: 0.01 },
);

// ------------------------------------------------------------------ 播放器

function setProgressHint(text) {
  els.progressHint.replaceChildren();
  if (text) els.progressHint.textContent = text;
  else els.progressHint.textContent = '—';
}

async function openPlayer(id) {
  const base = state.videos.find((v) => v.id === id);
  if (!base) return;

  state.current = { video: base, meta: null };
  state.lastProgressAt = 0;
  els.playerTitle.textContent = base.name;
  els.playerMeta.textContent = `${formatDateKey(base.dateKey)} · ${formatBytes(base.size)}${
    base.width && base.height ? ` · ${base.width}×${base.height}` : ''
  }`;
  setProgressHint('正在读取播放进度…');
  els.player.classList.remove('hidden');
  els.player.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  let detail = base;
  try {
    detail = await fetchJson(`/api/video/${id}`);
  } catch (err) {
    showToast(`读取视频信息失败：${err.message}`, 'error');
  }
  if (!state.current || state.current.video.id !== id) return;

  const meta = detail.meta ?? {};
  state.current.meta = { ...meta };

  const resume = Number(meta.progress) || 0;
  const video = els.playerVideo;
  video.playbackRate = Number(els.speedSelect.value) || 1;
  video.src = base.url;
  video.load();

  video.onloadedmetadata = () => {
    if (!state.current || state.current.video.id !== id) return;
    if (resume > 1 && (!Number.isFinite(video.duration) || resume < video.duration - 2)) {
      try {
        video.currentTime = resume;
      } catch {
        /* ignore */
      }
      setProgressHint(`已恢复到上次位置 ${formatClock(resume)}`);
    } else {
      setProgressHint('从头开始播放');
    }
    video.play().catch(() => {
      setProgressHint('已就绪，点击播放');
    });
  };

  patchVideo(id, {
    playCount: (Number(meta.playCount) || 0) + 1,
    lastPlayedAt: Date.now(),
  })
    .then((updated) => {
      if (state.current && state.current.video.id === id && updated.meta) {
        state.current.meta = updated.meta;
      }
    })
    .catch((err) => showToast(`更新播放次数失败：${err.message}`, 'error'));
}

function saveProgress(immediate = false) {
  const current = state.current;
  if (!current) return;
  const time = els.playerVideo.currentTime;
  if (!Number.isFinite(time) || time < 0) return;
  const now = Date.now();
  if (!immediate && now - state.lastProgressAt < 5000) return;
  state.lastProgressAt = now;
  patchVideo(current.video.id, { progress: Math.round(time * 10) / 10 }).catch((err) =>
    showToast(`保存播放进度失败：${err.message}`, 'error'),
  );
}

async function closePlayer() {
  if (!state.current) return;
  saveProgress(true);
  state.current = null;
  const video = els.playerVideo;
  video.pause();
  video.removeAttribute('src');
  video.load();
  els.player.classList.add('hidden');
  els.player.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
}

function seekBy(seconds) {
  const video = els.playerVideo;
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    els.playerShell.requestFullscreen?.().catch(() => showToast('当前浏览器不支持全屏', 'error'));
  }
}

els.playerVideo.addEventListener('timeupdate', () => saveProgress(false));
els.playerVideo.addEventListener('pause', () => saveProgress(true));
els.playerVideo.addEventListener('ended', () => saveProgress(true));
els.playerVideo.addEventListener('error', () => {
  if (state.current) showToast('视频加载失败，请检查文件是否仍然存在', 'error');
});
els.speedSelect.addEventListener('change', () => {
  els.playerVideo.playbackRate = Number(els.speedSelect.value) || 1;
});
els.closePlayer.addEventListener('click', closePlayer);
els.player.addEventListener('click', (event) => {
  if (event.target === els.player) closePlayer();
});

document.addEventListener('keydown', (event) => {
  if (els.player.classList.contains('hidden')) return;
  const tag = event.target?.tagName;
  const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

  if (event.key === 'Escape') {
    event.preventDefault();
    closePlayer();
    return;
  }
  if (inField) return;

  switch (event.key) {
    case ' ':
    case 'Spacebar':
      event.preventDefault();
      if (els.playerVideo.paused) els.playerVideo.play().catch(() => {});
      else els.playerVideo.pause();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      seekBy(-5);
      break;
    case 'ArrowRight':
      event.preventDefault();
      seekBy(5);
      break;
    case 'f':
    case 'F':
      event.preventDefault();
      toggleFullscreen();
      break;
    default:
      break;
  }
});

// ------------------------------------------------------------------ 顶栏交互

let searchTimer = 0;
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.searchInput.value.trim().toLowerCase();
    renderGrid();
  }, 120);
});

els.sortSelect.addEventListener('change', () => {
  state.sort = els.sortSelect.value;
  renderGrid();
});

els.clearFilterBtn.addEventListener('click', clearFilters);

els.openAppBtn.addEventListener('click', () => {
  window.location.href = '/';
});

els.rescanBtn.addEventListener('click', async () => {
  els.rescanBtn.disabled = true;
  const original = els.rescanBtn.textContent;
  els.rescanBtn.textContent = '扫描中…';
  try {
    const result = await fetchJson('/api/rescan', { method: 'POST' });
    await loadLibrary(false);
    showToast(`扫描完成：${result.count} 个视频`);
  } catch (err) {
    showToast(`重新扫描失败：${err.message}`, 'error');
  } finally {
    els.rescanBtn.disabled = false;
    els.rescanBtn.textContent = original;
  }
});

window.addEventListener('beforeunload', () => {
  if (state.current) saveProgress(true);
});

loadLibrary(false);
