import type { Locale } from './translations';

/**
 * 界面文案的兜底翻译（第三批）：主页 / 侧栏 / 分组卡 / 设置页上仍会残留中文的短句。
 *
 * 这里只放「结构固定、可以逐字对应」的短语；带数字的句子（“最近更新 2026-10-13”、
 * “本目录 1401 个视频 · 含子文件夹共 1401 个”）走下面的正则规则，
 * 否则每来一个新数字就要补一条映射。
 */
export const EN_PHRASES_UI: Record<string, string> = {
  '更多操作': 'More actions',
  '打开': 'Open',
  '复制组名': 'Copy group name',
  '重命名': 'Rename',
  '收藏': 'Add to favorites',
  '已改名为「{name}」': 'Renamed to “{name}”',
  '改名失败，可能有同名分组': 'Rename failed — another group may use that name',
  '已删除分组「{name}」': 'Deleted group “{name}”',
  '删除分组「{name}」？其中 {count} 个视频会移到媒体库根目录，本地原始文件不会被删除。': 'Delete group “{name}”? Its {count} videos will move to the library root; the files on disk stay untouched.',
  // ── 分组 / 视频统一选中与移除语义 ─────────────────────
  '移除分组「{name}」': 'Remove group “{name}”',
  '该分组内有 {n} 个视频{extra}。请选择移除方式：': 'This group contains {n} videos{extra}. Choose how to remove it:',
  '该分组内有 1 个视频{extra}。请选择移除方式：': 'This group contains 1 video{extra}. Choose how to remove it:',
  '、{m} 个子分组': ', {m} subfolders',
  '仅删除分组': 'Remove group only',
  '视频移到「媒体库全部」根目录，仍保留在库中': 'Videos move to the “All Media” root and stay in the library',
  '删除分组和视频': 'Delete group and videos',
  '视频移入回收区，可在回收区恢复': 'Videos move to Trash and can be restored',
  '本地原始文件不会被删除。': 'Files on disk are not deleted.',
  '移除分组': 'Remove group',
  '已选 {n} 视频': 'Selected {n} videos',
  '已选 {n} 视频 / {m} 分组': 'Selected {n} videos / {m} groups',
  '移除方式': 'Removal mode',
  '{n} 个分组': '{n} groups',
  '移除选中的分组': 'Remove selected groups',
  '已移除 {n} 个分组，视频已移入回收区': 'Removed {n} groups; videos moved to Trash',
  '已移除 {n} 个分组，视频已移到媒体库根目录': 'Removed {n} groups; videos moved to the library root',
  '已移除「{name}」，视频已移到媒体库根目录': 'Removed “{name}”; videos moved to the library root',
  // ── 侧栏 ──────────────────────────────────────────────
  导入: 'Import',
  工作流: 'Workflow',
  最近观看: 'Recently Watched',
  '整理 · 分组': 'Organize · Groups',
  工具: 'Tools',
  回收区: 'Trash',
  中: 'ZH',
  网格: 'Grid',
  列表: 'List',
  多选: 'Select',
  新建: 'New',
  导入一组: 'Import Set',
  快捷菜单: 'Quick menu',
  '媒体库全部（支持拖动视频至此）': 'Media Library (drop videos here)',
  展开全部文件夹: 'Expand all folders',
  展开或收起全部分组: 'Expand or collapse all groups',
  分组管理: 'Manage groups',
  打开分组管理: 'Open group manager',
  重命名分组: 'Rename group',
  在根目录新建分组: 'New group at root',
  '返回上一级目录（支持拖动视频至此）': 'Back to parent folder (drop videos here)',

  // ── 首页视图 ──────────────────────────────────────────
  按日期: 'By Date',
  '按日期浏览全库；分组固定按日期，组内按当前排序':
    'Browse the whole library by date — groups stay date-sorted, cards follow the current sort',
  '最近 7 天': 'Last 7 days',
  '最近 30 天': 'Last 30 days',
  首页视图: 'Home view',
  展示形态: 'Display mode',
  '网格展示（缩略图）': 'Grid view (thumbnails)',
  '列表展示（名称 / 日期 / 分组 / 标签）': 'List view (name / date / group / tags)',
  未分组的视频: 'Ungrouped videos',
  '按文件夹整理，拖视频进分组卡即可归档': 'Organized by folder — drag a video onto a group card to file it',
  '点击进入 · 支持拖放归档': 'Click to open · drag & drop to file',
  拖到上面的分组卡即可归档: 'Drag onto a group card above to file it',

  // ── 批量 ──────────────────────────────────────────────
  '多选：批量分组 / 打标签 / 移动': 'Select: batch grouping / tags / move',
  进入多选模式: 'Enter multi-select',
  '选择（进入批量管理）': 'Select (enter batch mode)',

  // ── 空态与回收区 ──────────────────────────────────────
  '当前搜索关键词或标签/文件夹过滤条件未匹配到任何视频文件。':
    'No video matches the current search, tag or folder filter.',
  没有未看完的视频: 'No unfinished videos',
  '看过的视频看到 5 秒以上、还没看完，就会出现在这里，方便你下次接着练。':
    'Videos you watched past 5 seconds but did not finish show up here, ready to resume.',
  查看全部视频: 'View all videos',
  '移除的只是应用记录，磁盘文件从未改动': 'Only the app record is removed — files on disk are untouched',
  清空回收区: 'Empty trash',
  恢复: 'Restore',
  全选: 'Select all',
  删除选中: 'Delete selected',
  自动分类: 'Auto-categorize',
  难度: 'Difficulty',
  新增: 'New',
  清理孤立标签: 'Clean up orphan tags',
  关闭回收区: 'Close trash',
  '先选分类，再加标签': 'Pick a category first, then add a tag',
  '标签预设：导入和播放页可点选的分类标签':
    'Tag presets: categories you can pick while importing or inside the player',

  // ── 批量条 ────────────────────────────────────────────
  已选: 'Selected',
  快速分组: 'Quick group',
  '把选中的视频快速归入某个分组': 'File the selected videos into a group in one step',

  // ── 播放器 ────────────────────────────────────────────
  视图: 'View',
  舞曲: 'Track',
  准备动作与起手式: 'Prep & opening pose',
  '视图：骨架分屏与显示开关': 'View: skeleton split & display toggles',
  '信息：视频档案 · 留言 · 舞曲': 'Info: video profile · notes · track',
  删除该留言: 'Delete this note',

  // ── 标签维度 ──────────────────────────────────────────
  舞室: 'Studio',
  老师: 'Teacher',
  舞种: 'Style',
  来源: 'Source',
  '老师 / 舞种 / 来源': 'Teacher / Style / Source',
  标签预设: 'Tag Presets',

  // ── 设置：音乐识别 ────────────────────────────────────
  '播放器右侧「音乐」面板里的': 'In the “Music” panel on the right of the player',
  '去 ACRCloud 控制台拿 Host / Access Key / Secret': 'Get Host / Access Key / Secret from the ACRCloud console',

  // ── 设置：标签预设页 ──────────────────────────────────
  '点一下复制「分类:值」，可直接粘贴到播放页标签；播放页也可以点选写入。':
    'Click to copy a “category:value” pair and paste it into the player tag field — or click through from the player.',
  点选写入标签: 'Click to write a tag',
  网络: 'Network',
  演出: 'Performance',
  入门: 'Beginner',
  进阶: 'Intermediate',
  高难: 'Advanced',
  添加分类: 'Add category',
  恢复默认: 'Restore defaults',
  '分类名，如 老师': 'Category name, e.g. Teacher',
  'Kane, 饼饼, Jazz …': 'Kane, Bingbing, Jazz …',
  删除这个分类: 'Delete this category',
  '复制为「分类:值」标签，粘贴到播放页标签输入框':
    'Copy as a “category:value” tag and paste it into the player tag field',

  // ── 设置：存储与备份页 ────────────────────────────────
  '配置与密钥只保存在本机浏览器；视频与练习元数据由本机 DanceEcho Server 保存':
    'Config and keys stay in this browser; videos and practice metadata live in your local DanceEcho Server',
  '媒体库（服务端）': 'Library (server)',
  已连接: 'Connected',
  视频数: 'Videos',
  视频总大小: 'Total size',
  最近扫描: 'Last scan',
  浏览器缓存: 'Browser cache',
  '缓存只保存索引、缩略图与旧版本地副本；清理浏览数据不会删除磁盘上的视频，重新扫描即可恢复。':
    'The cache only holds the index, thumbnails and legacy local copies — clearing browser data never touches the videos on disk, just rescan to recover.',
  缓存视频记录: 'Cached video records',
  本地副本大小: 'Local copy size',
};

/** 动态句子的正则规则：字典没命中时按顺序尝试 */
export type PhrasePattern = [
  RegExp,
  (match: RegExpMatchArray, translate: (text: string, locale: Locale) => string) => string,
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TAG_DIMENSION_LABEL: Record<string, string> = {
  舞种: 'Style',
  来源: 'Source',
  老师: 'Teacher',
  // ── 首页标签筛选行 / 日期轴 ───────────────────────────
  标签筛选: 'Filter by tag',
  清除: 'Clear',
  今天: 'Today',
  昨天: 'Yesterday',
  未分组: 'Ungrouped',
  '还没有标签。导入时或标签库里可以加。': 'No tags yet — add them on import or in the tag library.',
  '这里还没有视频。导入视频，或用「导入一组」建一个分组。':
    'Nothing here yet. Import videos, or use “Import Set” to create a group.',
  // 2026-11：组卡片首页 + 批次导入
  '组名（一首歌一组）': 'Group name (one group per song)',
  '留空则用识别到的歌名，认不出就叫「新分组 N」':
    'Leave empty to use the recognized song title; if nothing is recognized it becomes “New group N”.',
  全部分组: 'All groups',
  收藏这个分组: 'Favorite this group',
  搜索分组名称: 'Search group names',
  '听歌识曲：整批只识别一次': 'Song ID: recognize once per batch',
  这批不识别: 'Not recognizing this batch',
  '这批不识别（手动命名）': 'Skip recognition (name it myself)',
  去填写密钥: 'Add API key',
  '同一支舞的几个机位认一次就够了：挑一个文件识别，歌名会写到整批的标题和标签里（分组名也用歌名）。':
    'One recognition covers every camera angle of the same dance: pick one file, and the song title is written to the whole batch (the group name uses it too).',
  '还没填 ACRCloud 密钥，暂时只能按文件名猜。到 设置 → 歌曲识别 填写后就能听音频识别。':
    'No ACRCloud key yet, so only filename guessing is available. Add one in Settings → Song recognition to identify from audio.',
  '如果这批里其实是两支不同的舞，只识别一条会把另一支也打上同一个歌名——建议关掉识别，分开导入。':
    'If this batch actually contains two different dances, one recognition will watermark both with the same song — turn recognition off and import them separately.',
  文件夹管理: 'Folder manager',
  新建文件夹: 'New folder',
  '搜索分组名称…': 'Search group names…',
};

const WEEKDAY_EN: Record<string, string> = {
  周一: 'Mon',
  周二: 'Tue',
  周三: 'Wed',
  周四: 'Thu',
  周五: 'Fri',
  周六: 'Sat',
  周日: 'Sun',
};

const BATCH_SONG_PATTERNS_UI: PhrasePattern[] = [
  [/^1 条识别，结果应用到 (\d+) 条$/, (match) => `1 recognition applied to ${match[1]} videos`],
  [/^识别这个：(.*)$/, (match, translate) => `Recognize: ${translate(match[1], 'en')}`],
  [/^没有匹配「(.*)」的分组。$/, (match, translate) => `No group matches “${translate(match[1], 'en')}”.`],
  [/^把选中的 (\d+) 个视频归入$/, (match) => `Move ${match[1]} selected videos into`],
  [/^将创建分组「(.*)」$/, (match, translate) => `Will create group “${translate(match[1], 'en')}”`],
];

export const PHRASE_PATTERNS: PhrasePattern[] = [...BATCH_SONG_PATTERNS_UI,
  // 2026 年 9 月（时间轴月份标题）
  [
    /^(\d{4})\s*年\s*(\d{1,2})\s*月$/,
    (m) => `${MONTHS[Math.min(11, Math.max(0, Number(m[2]) - 1))]} ${m[1]}`,
  ],
  // 最近更新 2026-10-13
  [/^最近更新\s*(.+)$/, (m) => `Updated ${m[1]}`],
  // 根目录直接 3 个视频 · 全库共 1408 个
  [
    /^根目录直接\s*(\d+)\s*个视频\s*·\s*全库共\s*(\d+)\s*个$/,
    (m) => `${m[1]} in root · ${m[2]} in library`,
  ],
  // 本目录 1401 个视频 · 含子文件夹共 1401 个
  [
    /^本目录\s*(\d+)\s*个视频\s*·\s*含子文件夹共\s*(\d+)\s*个$/,
    (m) => `${m[1]} videos here · ${m[2]} including subfolders`,
  ],
  // 003_MY_Dance_Viedio：1401 个视频（分组节点 tooltip）
  [/^(.+?)：\s*(\d+)\s*个视频$/, (m) => `${m[1]}: ${m[2]} videos`],
  // 在「003_MY_Dance_Viedio」下新建分组 / 进入「003_MY_Dance_Viedio」
  [/^在「(.+)」下新建分组$/, (m) => `New group in “${m[1]}”`],
  [/^进入「(.+)」$/, (m) => `Open “${m[1]}”`],
  // 选择 two.mp4
  [/^选择\s+(.+)$/, (m) => `Select ${m[1]}`],
  // 跳转到留言 准备动作与起手式
  [/^跳转到留言\s*(.+)$/, (m, translate) => `Jump to note ${translate(m[1], 'en')}`],
  // 准备动作与起手式 (00:17.8) —— 名称翻，时间戳原样
  [/^(.+?)\s*\((\d{1,2}:\d{2}\.\d+)\)$/, (m, translate) => `${translate(m[1], 'en')} (${m[2]})`],
  // · 2026/10/30 移入
  [/^·\s*(.+?)\s*移入$/, (m) => `· Moved ${m[1]}`],
  // 选择分类 舞种 / 选择标签 舞种:Hiphop / Rename 舞种:Hiphop
  [/^选择分类\s*(.+)$/, (m, t) => `Select category ${t(m[1], 'en')}`],
  [/^选择标签\s*(.+)$/, (m, t) => `Select tag ${t(m[1], 'en')}`],
  [/^Rename\s+(.+)$/, (m, t) => `Rename ${t(m[1], 'en')}`],
  [/^Delete\s+(.+)$/, (m, t) => `Delete ${t(m[1], 'en')}`],
  // 0 条 / 1 天
  [/^(\d+)\s*条$/, (m) => `${m[1]} records`],
  [/^(\d+)\s*天$/, (m) => `${m[1]} days`],
  // 10 月 25 日 · 周日（按天分组的时间轴标题）
  [
    /^(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*·\s*(周[一二三四五六日])$/,
    (m) => `${MONTHS[Math.min(11, Math.max(0, Number(m[1]) - 1))]} ${m[2]} · ${WEEKDAY_EN[m[3]] ?? m[3]}`,
  ],
  // 2025 年 6 月 3 日
  [
    /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/,
    (m) => `${MONTHS[Math.min(11, Math.max(0, Number(m[2]) - 1))]} ${m[3]}, ${m[1]}`,
  ],
  // 舞种:Hiphop / 来源:舞室 —— 维度名翻，值再走一次翻译（自定义值原样保留）
  [
    /^(舞种|来源|老师)\s*[:：]\s*(.+)$/,
    (m, translate) => `${TAG_DIMENSION_LABEL[m[1]] ?? m[1]}: ${translate(m[2], 'en')}`,
  ],
];
