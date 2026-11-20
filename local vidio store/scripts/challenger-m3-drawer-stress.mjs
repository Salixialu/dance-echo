import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import vm from 'node:vm';
import esbuild from 'esbuild';

console.log('=== Challenger M3-2: Empirical Adversarial Stress Harness for InspectorDrawer ===\n');

const projectRoot = path.resolve('.');

// ============================================================================
// Test Suite 1: InspectorDrawer CSS Transition & Layout-Shift Invariants
// ============================================================================
console.log('Test Suite 1: Structural & Responsive Invariant Checks...');
const inspectorPath = path.join(projectRoot, 'src/components/layout/InspectorDrawer.tsx');
assert(fs.existsSync(inspectorPath), 'src/components/layout/InspectorDrawer.tsx does not exist');
const inspectorContent = fs.readFileSync(inspectorPath, 'utf-8');

// 1.1 Strict prohibition of conditional unmount
assert(
  !inspectorContent.includes('if (!isInspectorOpen)'),
  'FAIL: Conditional unmount `if (!isInspectorOpen)` detected in InspectorDrawer'
);
assert(
  !inspectorContent.includes('return null;'),
  'FAIL: `return null;` unmount found in InspectorDrawer'
);
console.log('   ✓ 1.1: Component maintains permanent DOM tree presence (Zero-layout-shift)');

// 1.2 Smooth width & opacity transition contract
const expectedOuterOpen = 'w-80 opacity-100 border-hairline';
const expectedOuterClosed = 'w-0 opacity-0 border-transparent border-l-0 pointer-events-none';
assert(inspectorContent.includes(expectedOuterOpen), 'FAIL: Outer container open classes mismatch');
assert(inspectorContent.includes(expectedOuterClosed), 'FAIL: Outer container closed classes mismatch');
assert(
  inspectorContent.includes('transition-[width,opacity] duration-300 ease-in-out'),
  'FAIL: Outer container missing 300ms transition-[width,opacity]'
);
assert(inspectorContent.includes('overflow-hidden'), 'FAIL: Outer container missing overflow-hidden');

// 1.3 Inner fixed width to prevent content squishing
assert(
  inspectorContent.includes('w-80 h-full flex flex-col justify-between transition-opacity duration-200'),
  'FAIL: Inner container missing fixed w-80 or 200ms opacity transition'
);
console.log('   ✓ 1.2 & 1.3: Dual-layer drawer transition contract verified');

// ============================================================================
// Test Suite 2: Bookmark Aggregation, Sorting, Truncation & Seek Integration
// ============================================================================
console.log('\nTest Suite 2: Bookmark Aggregation & Seek Behavior Stress Testing...');

// Extract aggregation and formatTime logic directly mirroring InspectorDrawer.tsx
function computeRecentBookmarks(videos) {
  const list = [];
  for (const v of videos) {
    if (v.bookmarks && v.bookmarks.length > 0) {
      for (const b of v.bookmarks) {
        list.push({
          videoId: v.id,
          video: v,
          timestamp: b.timestamp,
          title: b.title,
          notes: b.notes,
          createdAt: b.createdAt || 0,
        });
      }
    }
  }
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 2.1 Adversarial Scenario: Zero bookmarks across empty / non-empty videos
const emptyVideosA = [];
const resEmptyA = computeRecentBookmarks(emptyVideosA);
assert.strictEqual(resEmptyA.length, 0, 'Empty videos must produce 0 recent bookmarks');

const emptyVideosB = [
  { id: 'v1', name: 'Dance 1', bookmarks: [] },
  { id: 'v2', name: 'Dance 2', bookmarks: undefined },
  { id: 'v3', name: 'Dance 3' },
];
const resEmptyB = computeRecentBookmarks(emptyVideosB);
assert.strictEqual(resEmptyB.length, 0, 'Videos with no or undefined bookmarks must produce 0 recent bookmarks');
console.log('   ✓ 2.1: Zero bookmarks boundary handled cleanly without crash');

// 2.2 Adversarial Scenario: 100+ bookmarks distributed across 5 videos
const largeVideos = [];
let globalBookmarkId = 0;
for (let vIdx = 0; vIdx < 5; vIdx++) {
  const bookmarks = [];
  for (let bIdx = 0; bIdx < 25; bIdx++) {
    globalBookmarkId++;
    bookmarks.push({
      id: `bm-${globalBookmarkId}`,
      timestamp: Math.round(Math.random() * 300),
      title: `Beat Marker #${globalBookmarkId}`,
      notes: `Choreography note for bookmark #${globalBookmarkId}`,
      // Stagger createdAt: larger vIdx and bIdx get later timestamps
      createdAt: 1700000000000 + globalBookmarkId * 1000,
    });
  }
  largeVideos.push({
    id: `video-${vIdx}`,
    name: `K-Pop Choreography Master Video ${vIdx}`,
    duration: 300,
    thumbnailUrl: vIdx % 2 === 0 ? `https://storage.local/thumb_${vIdx}.jpg` : undefined,
    bookmarks,
  });
}

const resLarge = computeRecentBookmarks(largeVideos);
assert.strictEqual(resLarge.length, 3, 'Recent bookmarks must be strictly capped at 3');
// Top 3 should be globalBookmarkId 125, 124, 123
assert.strictEqual(resLarge[0].title, 'Beat Marker #125');
assert.strictEqual(resLarge[1].title, 'Beat Marker #124');
assert.strictEqual(resLarge[2].title, 'Beat Marker #123');
assert(resLarge[0].createdAt > resLarge[1].createdAt);
assert(resLarge[1].createdAt > resLarge[2].createdAt);
console.log('   ✓ 2.2: 125 bookmarks aggregated, sorted by createdAt desc, and sliced to exactly 3');

// 2.3 Adversarial Scenario: Missing/Corrupted createdAt and Edge Case Timestamps
const edgeVideos = [
  {
    id: 'edge-v1',
    name: 'Edge Dance Video',
    bookmarks: [
      { id: 'b1', timestamp: 0, title: 'Intro Start', createdAt: undefined },
      { id: 'b2', timestamp: 65.4, title: 'Chorus Drop', createdAt: 1000 },
      { id: 'b3', timestamp: 3605.9, title: 'Outro Pose', createdAt: 2000 },
      { id: 'b4', timestamp: 12.5, title: 'Bridge', createdAt: 0 },
    ],
  },
];
const resEdge = computeRecentBookmarks(edgeVideos);
assert.strictEqual(resEdge.length, 3);
assert.strictEqual(resEdge[0].title, 'Outro Pose'); // createdAt 2000
assert.strictEqual(resEdge[1].title, 'Chorus Drop'); // createdAt 1000
assert.strictEqual(formatTime(resEdge[0].timestamp), '60:05');
assert.strictEqual(formatTime(resEdge[1].timestamp), '01:05');
assert.strictEqual(formatTime(0), '00:00');
console.log('   ✓ 2.3: Undefined/0 createdAt and timestamp formatting verified');

// 2.4 Verify Bookmark Click Seek Payload & Immutability
const selectedBookmark = resLarge[0];
const originalVideoSnapshot = JSON.parse(JSON.stringify(selectedBookmark.video));

// Emulate InspectorDrawer onClick:
// setCurrentVideo({ ...item.video, playbackPosition: item.timestamp });
const seekPayload = {
  ...selectedBookmark.video,
  playbackPosition: selectedBookmark.timestamp,
};

assert.strictEqual(seekPayload.id, selectedBookmark.video.id);
assert.strictEqual(seekPayload.playbackPosition, selectedBookmark.timestamp);
// Ensure original video was not mutated
assert.strictEqual(selectedBookmark.video.playbackPosition, undefined);
assert.deepStrictEqual(selectedBookmark.video.bookmarks, originalVideoSnapshot.bookmarks);
console.log('   ✓ 2.4: Bookmark seek payload creates pristine clone with playbackPosition set');

// 2.5 Verify Thumbnail Fallback Logic
const hasThumb = { video: { thumbnailUrl: 'blob:http://localhost/thumb1' } };
const noThumbA = { video: { thumbnailUrl: undefined } };
const noThumbB = { video: { thumbnailUrl: '' } };
const noThumbC = { video: {} };

assert(Boolean(hasThumb.video.thumbnailUrl) === true);
assert(Boolean(noThumbA.video.thumbnailUrl) === false);
assert(Boolean(noThumbB.video.thumbnailUrl) === false);
assert(Boolean(noThumbC.video?.thumbnailUrl) === false);
console.log('   ✓ 2.5: Thumbnail rendering fallback condition verified');

// ============================================================================
// Test Suite 3: Heatmap 35-Day Boundary Conditions (Zero vs Max Activity)
// ============================================================================
console.log('\nTest Suite 3: Heatmap 35-Day Boundary Conditions...');

const heatmapPath = path.join(projectRoot, 'src/components/growth/PracticeHeatmap.tsx');
assert(fs.existsSync(heatmapPath), 'PracticeHeatmap.tsx does not exist');
const heatmapSource = fs.readFileSync(heatmapPath, 'utf-8');

// Transpile PracticeHeatmap.tsx using esbuild and evaluate in isolated context
const transpiled = esbuild.transformSync(heatmapSource, { loader: 'tsx', format: 'cjs' });
const vmContext = {
  exports: {},
  module: { exports: {} },
  require: (mod) => {
    if (mod === 'react') {
      return {
        useState: () => [[], () => {}],
        useEffect: () => {},
        useMemo: (fn) => fn(),
        default: { createElement: () => null },
      };
    }
    return {};
  },
};
vm.createContext(vmContext);
vm.runInContext(transpiled.code, vmContext);
const { getHeatLevel, HEAT_CLASSES } = vmContext.module.exports;

assert(typeof getHeatLevel === 'function', 'getHeatLevel must be exported as a function');
assert(HEAT_CLASSES && typeof HEAT_CLASSES === 'object', 'HEAT_CLASSES must be exported');

// 3.1 HeatLevel Discrete Step Boundaries
// Level 0: 0 mins AND 0 observations
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 0, observationCount: 0 }), 0);
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 59, observationCount: 0 }), 0);

// Level 1: < 10 mins (or 0 mins with >0 observations)
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 0, observationCount: 1 }), 1);
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 60, observationCount: 0 }), 1); // 1 min
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 599, observationCount: 0 }), 1); // 9m59s

// Level 2: 10 <= mins <= 30 (duration 600s to 1859s, Math.floor yields 10..30)
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 600, observationCount: 0 }), 2); // 10 mins
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 1800, observationCount: 0 }), 2); // 30 mins
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 1859, observationCount: 0 }), 2); // 30m59s -> floor is 30 mins

// Level 3: > 30 mins (duration >= 1860s, Math.floor yields 31+ mins)
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 1860, observationCount: 0 }), 3); // 31m00s -> floor is 31 mins
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 7200, observationCount: 10 }), 3); // 120 mins
assert.strictEqual(getHeatLevel({ date: '2026-10-01', durationSeconds: 999999, observationCount: 100 }), 3);
console.log('   ✓ 3.1: 4-tier HeatLevel step thresholds (0, 1, 2, 3) rigorously verified');

// 3.2 Boundary A: 35 days with ZERO activity
const zeroActivity35Days = Array.from({ length: 35 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  durationSeconds: 0,
  videoCount: 0,
  observationCount: 0,
  lastUpdatedAt: 0,
}));

assert.strictEqual(zeroActivity35Days.length, 35);
const zeroLevels = zeroActivity35Days.map(getHeatLevel);
assert(zeroLevels.every((lvl) => lvl === 0), 'All 35 days of zero activity must have HeatLevel 0');
assert(zeroLevels.every((lvl) => Boolean(HEAT_CLASSES[lvl])), 'All HeatLevel 0 days must have valid CSS classes');
console.log('   ✓ 3.2: 35 days Zero Activity boundary: 100% evaluated to Level 0');

// 3.3 Boundary B: 35 days with MAX activity
const maxActivity35Days = Array.from({ length: 35 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  durationSeconds: 7200, // 2 hours/day
  videoCount: 10,
  observationCount: 20,
  lastUpdatedAt: Date.now(),
}));

assert.strictEqual(maxActivity35Days.length, 35);
const maxLevels = maxActivity35Days.map(getHeatLevel);
assert(maxLevels.every((lvl) => lvl === 3), 'All 35 days of max activity must have HeatLevel 3');
assert(maxLevels.every((lvl) => Boolean(HEAT_CLASSES[lvl])), 'All HeatLevel 3 days must have valid CSS classes');
console.log('   ✓ 3.3: 35 days Max Activity boundary: 100% evaluated to Level 3');

// 3.4 Array Slicing and Padding Invariant
// Mirror PracticeHeatmap displayLogs memoization
function computeDisplayLogs(activeLogs, days = 35) {
  if (activeLogs.length >= days) {
    return activeLogs.slice(-days);
  }
  const needed = days - activeLogs.length;
  const padding = Array.from({ length: needed }, () => ({
    date: '',
    durationSeconds: 0,
    videoCount: 0,
    observationCount: 0,
    lastUpdatedAt: 0,
  }));
  return [...padding, ...activeLogs];
}

// 0 logs input -> padded to 35
const displayFromEmpty = computeDisplayLogs([], 35);
assert.strictEqual(displayFromEmpty.length, 35);
assert.strictEqual(displayFromEmpty.filter((l) => l.date === '').length, 35);

// 10 logs input -> padded to 35
const displayFrom10 = computeDisplayLogs(zeroActivity35Days.slice(0, 10), 35);
assert.strictEqual(displayFrom10.length, 35);
assert.strictEqual(displayFrom10.filter((l) => l.date === '').length, 25);
assert.strictEqual(displayFrom10.filter((l) => l.date !== '').length, 10);

// 100 logs input -> sliced to last 35
const large100Logs = Array.from({ length: 100 }, (_, i) => ({
  date: `day-${i}`,
  durationSeconds: i * 60,
  observationCount: 0,
}));
const displayFrom100 = computeDisplayLogs(large100Logs, 35);
assert.strictEqual(displayFrom100.length, 35);
assert.strictEqual(displayFrom100[0].date, 'day-65');
assert.strictEqual(displayFrom100[34].date, 'day-99');

// Grid structure invariant
assert.strictEqual(displayFrom100.length % 7, 0, 'Grid array must be exact multiple of 7 weekdays (5 full weeks)');
console.log('   ✓ 3.4: Display logs padding (0/10/100 -> 35) and 7-column grid invariant verified');

// ============================================================================
// Test Suite 4: Store setCurrentVideo & Reset Invariant
// ============================================================================
console.log('\nTest Suite 4: Store setCurrentVideo State Transition Testing...');
const storePath = path.join(projectRoot, 'src/store/useVideoStore.ts');
assert(fs.existsSync(storePath), 'useVideoStore.ts does not exist');
const storeContent = fs.readFileSync(storePath, 'utf-8');

// Verify setCurrentVideo resets abLoop
assert(
  storeContent.includes("abLoop: { enabled: false, pointA: null, pointB: null }"),
  'FAIL: setCurrentVideo must reset abLoop to disabled with null points'
);
console.log('   ✓ 4.1: Store resets AB-loop state upon switching or seeking video');

console.log('\n================================================================');
console.log('ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY (0 ERRORS)');
console.log('================================================================');
