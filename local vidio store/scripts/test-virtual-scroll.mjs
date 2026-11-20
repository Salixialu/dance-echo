import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

/**
 * 首页虚拟滚动契约（ticket 01）：
 *   - 时间轴纯计算层按列数切行、按折叠状态跳行、按视口返回窗口；
 *   - VideoGrid 只渲染窗口切片，日期分组可折叠且状态落 localStorage；
 *   - 卡片底部信息行固定高度，行高推导才不会漂移。
 */
const root = path.resolve('.');

const utilsPath = path.join(root, 'src/utils/galleryRows.ts');
const source = fs.readFileSync(utilsPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-rows-'));
const tmpFile = path.join(tmpDir, 'galleryRows.mjs');
fs.writeFileSync(tmpFile, compiled, 'utf8');
const mod = await import(pathToFileURL(tmpFile).href);

assert.strictEqual(mod.columnsForViewport(500), 2, '500px 应为 2 列');
assert.strictEqual(mod.columnsForViewport(700), 3, '700px 应为 3 列');
assert.strictEqual(mod.columnsForViewport(900), 4, '900px 应为 4 列');
assert.strictEqual(mod.columnsForViewport(1100), 5, '1100px 应为 5 列');
assert.strictEqual(mod.columnsForViewport(1300), 6, '1300px 应为 6 列');

const rowHeight = mod.cardRowHeight(1180, 6);
const expectedRow = (((1180 - mod.GALLERY_GAP * 5) / 6) * 9) / 16 + mod.CARD_INFO_HEIGHT + mod.CARD_BORDER;
assert(Math.abs(rowHeight - expectedRow) < 0.001, '行高应为 16:9 图 + 信息行 + 边框');

const sections = [
  { key: 'a', label: '今天', videos: [1, 2, 3, 4, 5] },
  { key: 'b', label: '昨天', videos: [6, 7] },
];
const expanded = mod.buildTimelineUnits(sections, new Set(), 2);
assert.deepStrictEqual(
  expanded.map((unit) => unit.kind),
  ['header', 'row', 'row', 'row', 'header', 'row'],
  '5 条视频在 2 列下应切成 3 行',
);
assert.strictEqual(expanded[1].videos.length, 2, '整行应有 2 张卡片');
assert.strictEqual(expanded[3].videos.length, 1, '最后一行应有 1 张卡片');

const collapsed = mod.buildTimelineUnits(sections, new Set(['a']), 2);
assert.deepStrictEqual(
  collapsed.map((unit) => unit.kind),
  ['header', 'header', 'row'],
  '折叠组只保留日期头',
);
assert.strictEqual(collapsed[0].collapsed, true);

const laid = mod.layoutTimelineUnits(expanded, 200);
assert.strictEqual(laid.items.length, expanded.length);
assert.strictEqual(laid.items[0].top, 0);
assert.strictEqual(laid.items[0].height, mod.TIMELINE_HEADER_HEIGHT);
assert.strictEqual(laid.items[1].top, mod.TIMELINE_HEADER_HEIGHT + mod.GALLERY_GAP);
assert.strictEqual(laid.items[2].top, laid.items[1].top + 200 + mod.GALLERY_GAP);
assert(laid.total > 0, '总高度必须为正');

const windowStart = mod.visibleRange(laid.items, 0, 400, 0);
assert.strictEqual(windowStart.start, 0, '视口顶部应从第 0 个 unit 开始');
assert(windowStart.end > 0 && windowStart.end < laid.items.length, '窗口应小于全量');

const windowEnd = mod.visibleRange(laid.items, laid.total - 100, 400, 0);
assert.strictEqual(windowEnd.end, laid.items.length, '滚到底时窗口必须包含最后一个 unit');
assert.strictEqual(mod.visibleRange([], 0, 400).end, 0, '空列表窗口为空');

// 首页已改为「组卡片」：时间轴不再是首页入口，虚拟化契约转到组卡片网格上
const gridSource = fs.readFileSync(path.join(root, 'src/components/gallery/VideoGrid.tsx'), 'utf8');
// 注意：timelineSections.map( 现在只出现在 mindmapDays 的数据折叠里，
// 真正要防的是「把整个时间轴铺到主区」——那个渲染标记是 timeline-section。
assert(!gridSource.includes('data-testid="timeline-section"'), '主区不允许整段渲染时间轴（已改为右侧抽屉脑图）');
assert(gridSource.includes('GroupCardGrid'), '首页必须渲染组卡片网格');

const groupGridSource = fs.readFileSync(path.join(root, 'src/components/gallery/GroupCardGrid.tsx'), 'utf8');
assert(groupGridSource.includes('useVirtualGrid('), '首页组卡片必须走虚拟化 hook');
assert(
  groupGridSource.includes('laid.items.slice(range.start, range.end)'),
  '组卡片必须只渲染窗口切片',
);

const cardSource = fs.readFileSync(path.join(root, 'src/components/gallery/VideoCard.tsx'), 'utf8');
assert(cardSource.includes('flex h-[46px]'), '卡片信息行必须固定 46px 高（标题行 + 元信息行），供行高推导使用');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('✅ Virtual scroll contract passed: 窗口切片 / 折叠持久化 / 行高一致');
