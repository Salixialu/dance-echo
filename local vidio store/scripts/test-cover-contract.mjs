import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

/**
 * 封面契约（ticket 05）：
 *   - 卡片封面容器固定 16:9，保证行高整齐
 *   - 画面本身 object-contain（不裁掉头脚），并用同一张封面做虚化底
 *   - 竖屏/横屏共用同一实现，无按宽高比分支裁切
 */
const root = path.resolve('.');
const cardPath = path.join(root, 'src/components/gallery/VideoCard.tsx');
const source = fs.readFileSync(cardPath, 'utf8');

assert(source.includes("const coverAspectClass = 'aspect-video'"), 'Card cover container must be 16:9');
assert(/className=\{[^}]*object-contain/.test(source), 'Main cover image must use object-contain');
assert(source.includes('aria-hidden="true"'), 'Blurred backdrop must be decorative');
assert(source.includes('backdrop-blur'), 'Blurred backdrop missing');
assert(!source.includes('object-cover object-center transition-transform'), 'Legacy object-cover main image still present');

console.log('✅ Cover contract passed: 16:9 container + contain main image + decorative blur backdrop');
