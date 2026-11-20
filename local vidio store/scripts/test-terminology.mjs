import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 术语契约：收藏 / 分组 / 练习瞬间。
 *
 * 目的：防止旧的「收藏集 / 标星 / 打点书签 / 已动作打点」再次混进 UI。
 * 只扫描字符串字面量（可见文案），不扫描注释，避免误伤代码注释里的历史描述。
 *
 * 用法：node scripts/test-terminology.mjs
 * 退出码 0 = 全部通过。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const srcRoot = path.join(projectRoot, 'src');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(srcRoot);
const literalPattern = /'([^'\n]{1,120})'|"([^"\n]{1,120})"|`([^`\n]{1,120})`/g;

const legacyTerms = ['收藏集', '标星精选', '标星', '已动作打点', '打点书签', '标记动作片段'];
const offenders = [];

for (const file of files) {
  const rel = path.relative(projectRoot, file);
  const raw = fs.readFileSync(file, 'utf8');
  let match;
  literalPattern.lastIndex = 0;
  while ((match = literalPattern.exec(raw))) {
    const text = match[1] ?? match[2] ?? match[3] ?? '';
    for (const term of legacyTerms) {
      if (text.includes(term)) offenders.push(`${rel}: "${text}" contains "${term}"`);
    }
  }
}
check('旧术语不再出现在可见文案里', offenders.length === 0, offenders.slice(0, 8).join('\n'));

// 新术语在关键位置出现
const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');
const sidebar = read('src/components/sidebar/Sidebar.tsx');
const grid = read('src/components/gallery/VideoGrid.tsx');
const drawer = read('src/components/player/DancePlayerRightDrawer.tsx');
const card = read('src/components/gallery/VideoCard.tsx');
const phrases = read('src/i18n/phrases.ts');

check('侧栏使用「收藏」', sidebar.includes("tr('收藏')"));
check('侧栏使用「留言」', sidebar.includes("tr('留言')"));
check('分组筛选条使用「分组」', grid.includes("tr('只看有留言的视频')") && grid.includes('分组'));
check('播放器抽屉页签使用「留言」', drawer.includes("label: '留言'"));
check('卡片使用心形收藏', card.includes('<Heart') && card.includes("tr('取消收藏')"));
check(
  '短语表覆盖新词与新备份说明',
  phrases.includes("留言: 'Notes'") &&
    phrases.includes("'只看有留言的视频'") &&
    phrases.includes('回收站、观察与练习记录'),
);

// 术语更新验证结束

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n      ${r.detail}`}`);
}
console.log(`\n${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ''}`);
process.exit(failed === 0 ? 0 : 1);
