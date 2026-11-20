import type { Locale } from './translations';
import { EN_PHRASES_EXTRA } from './phrasesExtra';
import { EN_PHRASES_UI, PHRASE_PATTERNS } from './phrasesUi';

/**
 * 短语级翻译表：key 为中文原文，value 为英文。
 * 用途：项目里大量文案直接写在中式 JSX 中，逐条改造成 t('namespace.key')
 * 成本高且容易漏；这里用「中文原文 → 英文」的短语映射，配合 useI18n().tr()
 * 在英文模式下自动替换，中文模式原样返回。
 *
 * 约定：
 * - 短语必须是完整的可见文案（不要放半句），否则替换后语序会怪。
 * - 支持 {name} 占位符，用 tr('共 {count} 个视频', { count }) 传参。
 */
export const EN_PHRASES: Record<string, string> = {
  // ── 通用 ──────────────────────────────────────────────
  确定: 'Confirm',
  取消: 'Cancel',
  关闭: 'Close',
  保存: 'Save',
  删除: 'Delete',
  重命名: 'Rename',
  创建: 'Create',
  进入: 'Enter',
  设置: 'Settings',
  更多: 'More',
  搜索: 'Search',
  清空: 'Clear',
  添加: 'Add',
  刷新: 'Refresh',
  收起: 'Collapse',
  展开: 'Expand',
  回到顶部: 'Back to top',
  全部: 'All',
  未打标签: 'Untagged',

  // ── 练习轨迹（画廊日期抽屉） ───────────────────────────
  练习轨迹: 'Practice timeline',
  按修改日期筛选: 'Filter by modified date',
  '近 26 周': 'Last 26 weeks',
  这天没有视频: 'No videos on this day',
  日期: 'Date',
  少: 'Less',
  多: 'More',
  练了: 'Practiced',
  分钟: 'min',
  小时: 'h',
  条留言: 'notes',
  累计: 'Total',
  媒体库: 'Library',
  天: 'days',
  条: 'videos',
  '近 12 个月': 'Last 12 months',
  当天整理: 'Added that day',
  '（按视频数折算）': '(counted from videos)',
  没有记录: 'No record',
  '有计时按时长 · 否则按视频数': 'Timer-based; otherwise by video count',
  '点一格，看那天整理和练过的视频': 'Pick a day to see what you worked on',
  回到本月: 'Back to this month',
  本月: 'This month',
  天有练习: 'days practiced',
  连续: 'streak',
  周: 'weeks',
  上个月: 'Previous month',
  下个月: 'Next month',
  清除筛选: 'Clear filter',
  '点一格，只看那天整理和练过的视频': 'Pick a day to see what you worked on',

  // ── 侧栏 ──────────────────────────────────────────────
  快捷筛选: 'Quick Filters',
  收藏: 'Favorites',
  文件夹目录: 'Folders',
  常用标签: 'Frequent Tags',
  '标签库管理': 'Tag Library',
  标签库: 'Tag library',
  '设置：AI / 歌曲识别 / 识别性能': 'Settings: AI / Song ID / Performance',
  导入本地视频: 'Import Videos',
  '挂载本地视频目录': 'Mount Local Folder',
  导入视频文件: 'Import Video Files',
  载入内置演示视频: 'Load Demo Videos',
  '新建分组': 'New Group',
  新建空分组: 'New Empty Group',
  导入一组视频: 'Import a Group',
  全部视频: 'All Videos',
  分组: 'Groups',
  本层直接: 'direct',
  含子文件夹共: 'incl. subfolders',
  个视频: 'videos',
  个: '',
  'Dance Echo · 本地舞坊': 'Dance Echo · Local Studio',
  '本地就绪': 'Ready offline',

  // ── 首页空状态 ─────────────────────────────────────────
  '导入一次，自动成为一个分组': 'One import, one folder',
  '一次选中多个视频（或整堂课录像），自动归入同一个分组；素材只存在浏览器本地，零云端上传。':
    'Pick multiple clips (or a whole class) and they become one folder. Everything stays in your browser — nothing is uploaded.',
  拖拽视频到此处或点击导入: 'Drop videos here, or click to import',
  选择视频文件: 'Choose Files',
  载入演示: 'Load Demo',
  '支持 MP4 · MOV · MKV · WebM': 'MP4 · MOV · MKV · WebM',
  还没有视频: 'No videos yet',
  '还没有分组': 'No groups yet',
  '点击右上角「导入一组视频」，本次导入会自动成为一个分组':
    'Use "Import a Group" at the top right — each import becomes one folder',
  '空分组': 'Empty group',
  '含子分组': 'has subfolders',

  // ── 媒体库工具条 ───────────────────────────────────────
  按最近修改: 'Recently edited',
  按名称字母: 'Name A–Z',
  按视频时长: 'Duration',
  按评级高低: 'Rating',
  排序: 'Sort',
  筛选: 'Filter',
  留言: 'Notes',
  批量管理: 'Batch',
  退出批量: 'Exit batch',
  全选当前: 'Select all',
  取消全选: 'Deselect all',
  '批量移动...': 'Move…',
  '批量打标签...': 'Tag…',
  清除标签: 'Clear tags',
  已选中: 'Selected',
  '未发现匹配的舞蹈视频': 'No matching dance videos',
  没有找到符合条件的视频: 'No videos match these filters',
  请调整搜索关键词或标签筛选: 'Try a different keyword or tag',
  重置所有过滤条件: 'Reset all filters',
  '已在 {time} 添加留言': 'Note added at {time}',
  未评分: 'Unrated',
  暂无标签: 'No tags',
  '拖动调整顺序': 'Drag to reorder',

  // ── 播放器 ────────────────────────────────────────────
  '返回媒体库': 'Back to library',
  '骨架分屏: 单屏关': 'Mocap: Off',
  '骨架分屏: 2D纯骨架': 'Mocap: 2D Split',
  '骨架分屏: 3D空间': 'Mocap: 3D Split',
  '骨架分屏: 纯骨架': 'Mocap: Skeleton Only',
  视频附着: 'Overlay',
  音乐: 'Music',
  记录: 'Notes',
  信息: 'Info',
  贴合: 'Fitted',
  居中: 'Centered',
  '关节角度': 'Joint Angles',
  左膝: 'L-knee',
  右膝: 'R-knee',
  左肘: 'L-elbow',
  右肘: 'R-elbow',
  左髋: 'L-hip',
  右髋: 'R-hip',
  '舞者主体追踪': 'Dancer Tracking',
  '已锁定舞者': 'Dancer locked',
  '轨道': 'Trails',
  '轨迹': 'Trails',
  '镜像 (M)': 'Mirror (M)',
  '起点 A': 'Point A',
  '终点 B': 'Point B',
  'AB 循环': 'AB Loop',
  '清除循环': 'Clear Loop',
  '练速': 'Tempo',
  '偏': 'Offset',
  清晰度: 'Quality',
  倍速: 'Speed',
  音量: 'Volume',
  '全屏': 'Fullscreen',
  恢复自动居中: 'Reset auto-center',
  '纯骨架视图 (动作剪影)': 'Skeleton View (silhouette)',
  '2D 纯骨架分屏 (动作剪影)': '2D Skeleton Split',
  '3D 空间可旋转骨架': '3D Rotatable Skeleton',
  '原视频视口': 'Video',

  // ── 舞曲绑定 / 信息面板 ────────────────────────────────
  舞曲绑定: 'Track Binding',
  搜索歌曲: 'Search',
  听音识曲: 'Recognize Audio',
  手动填写: 'Manual',
  '歌曲标题': 'Title',
  '演唱者 / 编舞师': 'Artist / Choreographer',
  保存曲目档案: 'Save Track',
  立即开始识别音轨: 'Recognize from audio',
  从视频音轨直接识曲: 'Recognize the track from this video',
  '自动截取当前视频的 6 秒音频，连接云端音乐库识别':
    'Grabs a 6-second audio clip and matches it against a music database',
  已关联: 'Linked',
  未绑定舞曲: 'No track linked',
  '可通过下方搜歌或识曲快速绑定': 'Search or recognize below to link a track',
  视频信息: 'Video Info',
  视频总时长: 'Duration',
  节拍节奏: 'Tempo',
  留言数: 'Notes',
  我的评分: 'My Rating',
  所属分组: 'Folder',
  分类与舞种标签: 'Tags',
  '媒体库根目录': 'Library Root',
  '输入标签后回车，如：待复盘': 'Type a tag and press Enter',
  常用: 'Frequent',
  试听: 'Preview',
  '暂无封面': 'No cover',
  '加载中...': 'Loading…',

  // ── 设置中心 ──────────────────────────────────────────
  设置中心: 'Settings',
  '所有配置只保存在本机浏览器，不会上传到任何服务器':
    'All settings are stored in this browser only — nothing is uploaded.',
  'AI 助手': 'AI Assistant',
  舞蹈朋友的大脑: 'Your dance buddy brain',
  歌曲识别: 'Song ID',
  自动听出舞曲: 'Auto-detect tracks',
  识别性能: 'Performance',
  骨架跟踪速度: 'Skeleton tracking speed',
  关于: 'About',
  版本与数据: 'Version & data',
  '服务提供方': 'Provider',
  '模型': 'Model',
  '模型名称': 'Model name',
  '接口地址 (Base URL)': 'Base URL',
  '仅保存在本机 localStorage': 'Stored in local browser only',
  '获取 Key': 'Get a Key',
  '测试连接': 'Test connection',
  '姿态模型': 'Pose model',
  '极速 (Lite)': 'Fast (Lite)',
  '高精度 (Full)': 'Accurate (Full)',
  '多人识别 (最多 2 人)': 'Multi-person (up to 2)',
  '模型在页面加载时初始化，改动后需刷新生效。':
    'The model initializes on page load — refresh to apply changes.',
  '立即刷新': 'Refresh now',
  '测试连通': 'Test connection',
  '已配置': 'Configured',
  '未配置': 'Not configured',
  '识别 Host': 'Host',
  '版本': 'Version',
  '数据存储': 'Data storage',
  '标签、留言与练习记录保存在浏览器 IndexedDB 与 localStorage 中；视频本体留在本机磁盘，离线可用。':
    'Tags, notes and practice logs live in IndexedDB and localStorage in this browser; the videos themselves stay on disk. Works offline.',

  // ── 对话 / 弹窗 ───────────────────────────────────────
  'AI 舞蹈朋友': 'Dance Buddy',
  '你和舞蹈朋友聊点什么？': 'Ask your dance buddy anything',
  '发送': 'Send',
  '清空对话': 'Clear chat',
  '接口接入': 'API Setup',
  '舞蹈朋友 (Dance Buddy)': 'Dance Buddy',
  新建文件夹: 'New folder',
  重命名文件夹: 'Rename folder',
  文件夹名称: 'Folder name',
  '名称不能为空': 'Name cannot be empty',
  '已存在同名文件夹': 'A folder with this name already exists',
  '移动到此分组': 'Move to this folder',
  '全部移入': 'Move all',
  '确认删除': 'Confirm delete',
  '删除分组': 'Delete folder',
  '只删除整理结构，不会删除本地视频文件。':
    'Only the folder structure is removed — your local video files stay untouched.',

  // ── 存储与备份 ────────────────────────────────────────
  '存储与备份': 'Storage',
  '容量 / 持久化 / 备份': 'Quota / Persistence / Backup',
  '正在读取存储状态…': 'Reading storage status…',
  '浏览器本地存储': 'Browser storage',
  '已持久化': 'Persisted',
  '未持久化': 'Not persisted',
  '配额未知': 'Quota unknown',
  '视频记录': 'Video records',
  '分组 / 文件夹': 'Folders',
  '骨架观察': 'Pose observations',
  '练习打卡': 'Practice days',
  '视频原始大小': 'Source size',
  '封面占用（估算）': 'Thumbnails (est.)',
  '视频本体留在磁盘原位置，浏览器不复制；这里的数字来自服务端索引，与首页卡片一致。':
    'Videos stay on disk — the browser holds no copy. These numbers come from the server index and match the home cards.',
  '检测到 {n} 条旧版本地记录缺少可播放的视频文件（服务端媒体库里的条目不算）。可以重新导入对应目录自动识别，或清理这些失效记录。':
    '{n} legacy local records have no playable video file (server library entries are excluded). Re-import the folder to relink them, or clean them up.',
  '数据保护': 'Data protection',
  '备份文件包含标签、留言、播放进度、分组、回收站、观察与练习记录，不含视频本体。恢复会写回服务端媒体库；服务端不可达时只恢复浏览器缓存，并会明确提示。':
    'Backups contain tags, notes, progress, folders, trash, observations and practice logs — not the videos themselves. Restore writes back to the server library; when the server is unreachable it only restores the browser cache and says so.',
  '申请持久化': 'Request persistence',
  '导出备份': 'Export backup',
  '恢复备份': 'Restore backup',
  '清理失效记录': 'Clean up broken records',
  '注意：127.0.0.1 与 localhost 在浏览器里是两个不同的存储源，媒体库不互通。请固定使用同一个地址打开，避免出现"数据不见了"。':
    'Note: 127.0.0.1 and localhost are different storage origins — libraries do not carry over. Always open the app with the same address.',
  '还没有分组。导入一组视频会自动生成一个，用来存放课程或舞种。':
    'No groups yet — importing a set of videos creates one for a class or style.',
  '导入一组视频，自动成为一个分组': 'One import becomes one group',
  '只看有留言的视频': 'Only videos with notes',
  '取消收藏': 'Remove from favorites',
};

export function translatePhrase(text: string, locale: Locale): string {
  if (locale === 'zh') return text;
  const direct = EN_PHRASES[text] ?? EN_PHRASES_EXTRA[text] ?? EN_PHRASES_UI[text];
  if (direct) return direct;
  for (const [pattern, format] of PHRASE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return format(match, translatePhrase);
  }
  // 「标签：」「显示：」这类带冒号的标签，去掉冒号再查一次，英文里保留冒号
  const tail = text.slice(-1);
  if (tail === '：' || tail === ':') {
    const body = text.slice(0, -1);
    const inner = translatePhrase(body, locale);
    if (inner !== body) return `${inner}:`;
  }
  return text;
}
