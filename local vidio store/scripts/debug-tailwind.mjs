import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const tailwindConfigPath = path.resolve('tailwind.config.js');
const tailwindConfig = (await import(`file:///${tailwindConfigPath.replace(/\\/g, '/')}`)).default;

const testHtml = `
<div class="bg-space-void bg-space-surface bg-space-solid bg-space-elevated bg-space-panel bg-space-overlay">
  <div class="border-hairline border-hairline-subtle border-hairline-hover">
    <span class="text-accent-cyan text-accent-cyan-subtle border-accent-cyan-border">Cyan</span>
    <span class="text-accent-violet text-accent-violet-subtle border-accent-violet-border">Violet</span>
    <span class="text-accent-emerald text-accent-emerald-subtle border-accent-emerald-border">Emerald</span>
    <span class="text-accent-amber text-accent-amber-subtle border-accent-amber-border">Amber</span>
    <span class="text-accent-silver text-accent-silver-subtle border-accent-silver-border">Silver</span>
  </div>
  <div class="shadow-hairline shadow-glow-cyan shadow-glow-violet shadow-glow-emerald shadow-glow-amber"></div>
</div>
`;

const testTailwindConfig = {
  ...tailwindConfig,
  content: [{ raw: testHtml, extension: 'html' }],
};

const res = await postcss([tailwindcss(testTailwindConfig)]).process('@tailwind utilities;', { from: undefined });
console.log('--- COMPILED UTILITIES ---');
console.log(res.css);
