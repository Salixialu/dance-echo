/**
 * FolderDialogs.tsx — 文件夹管理闭环的统一弹层与菜单
 * 目的：彻底替代 window.prompt / window.confirm，保证桌面与移动端可用、样式统一。
 * 包含：ConfirmDialog / FolderNameDialog / FolderPickerDialog / FolderContextMenu / FolderManagerModal
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, FolderPlus, Pencil, Trash2, X, Check } from 'lucide-react';
import { useVideoStore } from '../../store/useVideoStore';
import type { TreeNode } from '../../services/storage/tagConfig';
import { useI18n } from '../../i18n/I18nContext';

// ─── 通用遮罩壳 ───────────────────────────────────────────────────────────────
interface OverlayProps {
  onClose: () => void;
  children: React.ReactNode;
  align?: 'center' | 'top';
}

const Overlay: React.FC<OverlayProps> = ({ onClose, children, align = 'center' }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150 flex justify-center ${
        align === 'top' ? 'items-start pt-24' : 'items-center'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl animate-in zoom-in-95 duration-150 ${className}`}
    onMouseDown={(event) => event.stopPropagation()}
  >
    {children}
  </div>
);

const actionsRow = 'flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3.5';
const ghostBtn = 'rounded-lg px-3.5 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition cursor-pointer';
const primaryBtn = 'rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 transition cursor-pointer';
const dangerBtn = 'rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition cursor-pointer';

// ─── 1. 确认框 ────────────────────────────────────────────────────────────────
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const { t, tr } = useI18n();
  if (!open) return null;
  return (
    <Overlay onClose={onCancel}>
      <Panel>
        <div className="flex items-start justify-between px-5 pt-5">
          <h3 data-testid="confirm-title" className="text-sm font-semibold text-white">{title}</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('关闭')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {message && (
          <div data-testid="confirm-message" className="px-5 py-3 text-xs leading-relaxed text-zinc-400">
            {message}
          </div>
        )}
        <div className={actionsRow}>
          <button type="button" className={ghostBtn} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            data-testid="confirm-ok"
            className={danger ? dangerBtn : primaryBtn}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
};

// ─── 1b. 移除分组（二选一语义）────────────────────────────────────────────────
export interface DeleteFolderDialogProps {
  open: boolean;
  folderName: string;
  videoCount: number;
  subfolderCount?: number;
  onConfirm: (mode: 'keep' | 'trash') => void;
  onCancel: () => void;
}

export const DeleteFolderDialog: React.FC<DeleteFolderDialogProps> = ({
  open,
  folderName,
  videoCount,
  subfolderCount = 0,
  onConfirm,
  onCancel,
}) => {
  const { tr } = useI18n();
  const [mode, setMode] = useState<'keep' | 'trash'>('keep');

  useEffect(() => {
    if (open) setMode('keep');
  }, [open]);

  if (!open) return null;

  const optionClass = (active: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
      active ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
    }`;

  return (
    <Overlay onClose={onCancel}>
      <Panel>
        <div className="flex items-start justify-between px-5 pt-5">
          <h3 data-testid="delete-folder-title" className="text-sm font-semibold text-white">
            {tr('移除分组「{name}」', { name: folderName })}
          </h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('关闭')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs leading-relaxed text-zinc-400">
            {videoCount === 1
              ? tr('该分组内有 1 个视频{extra}。请选择移除方式：', {
                  extra: subfolderCount > 0 ? tr('、{m} 个子分组', { m: subfolderCount }) : '',
                })
              : tr('该分组内有 {n} 个视频{extra}。请选择移除方式：', {
                  n: videoCount,
                  extra: subfolderCount > 0 ? tr('、{m} 个子分组', { m: subfolderCount }) : '',
                })}
          </p>
          <div className="mt-3 space-y-2" data-testid="delete-folder-dialog" role="radiogroup" aria-label={tr('移除方式')}>
            <label className={optionClass(mode === 'keep')}>
              <input
                type="radio"
                name="delete-folder-mode"
                data-testid="delete-folder-mode-keep"
                className="mt-0.5 accent-cyan-400"
                checked={mode === 'keep'}
                onChange={() => setMode('keep')}
              />
              <span>
                <span className="block text-xs font-semibold text-white">{tr('仅删除分组')}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{tr('视频移到「媒体库全部」根目录，仍保留在库中')}</span>
              </span>
            </label>
            <label className={optionClass(mode === 'trash')}>
              <input
                type="radio"
                name="delete-folder-mode"
                data-testid="delete-folder-mode-trash"
                className="mt-0.5 accent-cyan-400"
                checked={mode === 'trash'}
                onChange={() => setMode('trash')}
              />
              <span>
                <span className="block text-xs font-semibold text-white">{tr('删除分组和视频')}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{tr('视频移入回收区，可在回收区恢复')}</span>
              </span>
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">{tr('本地原始文件不会被删除。')}</p>
        </div>
        <div className={actionsRow}>
          <button type="button" className={ghostBtn} onClick={onCancel}>{tr('取消')}</button>
          <button type="button" data-testid="delete-folder-confirm" className={dangerBtn} onClick={() => onConfirm(mode)}>
            {tr('移除分组')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
};

// ─── 2. 名称输入框（新建 / 重命名）─────────────────────────────────────────────
export interface FolderNameDialogProps {
  open: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  hint?: React.ReactNode;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export const FolderNameDialog: React.FC<FolderNameDialogProps> = ({
  open,
  title,
  initialValue = '',
  placeholder = '文件夹名称',
  confirmLabel = '确定',
  hint,
  onSubmit,
  onCancel,
}) => {
  const { t, tr } = useI18n();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦并全选；输入值由挂载时的 initialValue 初始化，避免异步副作用覆盖用户输入
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const clean = value.trim();
    if (!clean) return;
    void onSubmit(clean);
  };

  return (
    <Overlay onClose={onCancel}>
      <Panel className="max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('关闭')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            data-testid="folder-name-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-400/60"
          />
          {hint && <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={onCancel}>{tr('取消')}</button>
            <button type="submit" data-testid="folder-name-confirm" className={primaryBtn} disabled={!value.trim()}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
};

// ─── 3. 目标文件夹选择器 ──────────────────────────────────────────────────────
export interface FolderPickerDialogProps {
  open: boolean;
  title: string;
  folders: TreeNode[];
  excludePaths?: string[];
  onPick: (path: string) => void;
  onCancel: () => void;
}

export const FolderPickerDialog: React.FC<FolderPickerDialogProps> = ({
  open,
  title,
  folders,
  excludePaths = [],
  onPick,
  onCancel,
}) => {
  const { t, tr } = useI18n();
  if (!open) return null;
  const excluded = new Set(excludePaths);
  return (
    <Overlay onClose={onCancel}>
      <Panel>
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('关闭')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto px-5 py-4">
          <button
            type="button"
            data-testid="folder-picker-root"
            onClick={() => onPick('')}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Folder className="h-3.5 w-3.5 text-cyan-400" />
            <span>{tr('媒体库根目录')}</span>
          </button>
          {folders.map((folder) => {
            if (excluded.has(folder.fullPath)) return null;
            return (
              <button
                key={folder.fullPath}
                type="button"
                data-folder-path={folder.fullPath}
                onClick={() => onPick(folder.fullPath)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                <span className="truncate">{folder.fullPath}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">{folder.videoCount}</span>
              </button>
            );
          })}
          {folders.length === 0 && (
            <p className="px-2.5 py-3 text-xs text-zinc-600">{tr('暂无可选文件夹')}</p>
          )}
        </div>
        <div className={actionsRow}>
          <button type="button" className={ghostBtn} onClick={onCancel}>{tr('取消')}</button>
        </div>
      </Panel>
    </Overlay>
  );
};

// ─── 4. 文件夹右键菜单 ────────────────────────────────────────────────────────
export interface FolderContextMenuProps {
  x: number;
  y: number;
  folderName: string;
  onNewSub: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  x,
  y,
  folderName,
  onNewSub,
  onRename,
  onDelete,
  onClose,
}) => {
  const { t, tr } = useI18n();
  useEffect(() => {
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/[0.08] hover:text-white';

  return createPortal(
    <div
      data-testid="folder-context-menu"
      className="fixed z-[130] w-44 rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left: Math.min(x, window.innerWidth - 190), top: Math.min(y, window.innerHeight - 170) }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="truncate px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-600">{folderName}</div>
      <button type="button" className={item} onClick={() => { onClose(); onNewSub(); }}>
        <FolderPlus className="h-3.5 w-3.5 text-cyan-400" />
        <span>{tr('新建子文件夹')}</span>
      </button>
      <button type="button" className={item} onClick={() => { onClose(); onRename(); }}>
        <Pencil className="h-3.5 w-3.5 text-zinc-400" />
        <span>{tr('重命名')}</span>
      </button>
      <div className="my-1 h-px bg-white/[0.06]" />
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-400 transition hover:bg-rose-950/50 hover:text-rose-300"
        onClick={() => { onClose(); onDelete(); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>{tr('删除文件夹')}</span>
      </button>
    </div>,
    document.body,
  );
};

// ─── 工具：扁平化文件夹树 ─────────────────────────────────────────────────────
export interface FlatFolder {
  path: string;
  name: string;
  depth: number;
  node: TreeNode;
}

export function flattenFolderTree(root: TreeNode): FlatFolder[] {
  const result: FlatFolder[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      result.push({ path: child.fullPath, name: child.name, depth, node: child });
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return result;
}

// ─── 5. 文件夹管理弹窗（移动端 / 深层级集中管理入口）──────────────────────────
export interface FolderManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({ open, onClose }) => {
  const { t, tr } = useI18n();
  const videos = useVideoStore((state) => state.videos);
  const folderRecords = useVideoStore((state) => state.folders);
  const getFolderTree = useVideoStore((state) => state.getFolderTree);
  const createFolder = useVideoStore((state) => state.createFolder);
  const renameFolder = useVideoStore((state) => state.renameFolder);
  const deleteFolder = useVideoStore((state) => state.deleteFolder);
  const getFolderStats = useVideoStore((state) => state.getFolderStats);
  const setSelectedFolderPath = useVideoStore((state) => state.setSelectedFolderPath);
  const showToast = useVideoStore((state) => state.showToast);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; videos: number; subfolders: number } | null>(null);
  const [query, setQuery] = useState('');
  /** 多选：勾选的路径。一次课几十个「新分组 N」时，逐个点删除太慢 */
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [batchConfirm, setBatchConfirm] = useState(false);

  const tree = useMemo(() => getFolderTree(), [getFolderTree, videos, folderRecords]);
  const flat = useMemo(() => flattenFolderTree(tree), [tree]);
  /** 一首歌一组之后组会到几百个，没有搜索就只能靠肉眼翻 */
  const shown = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return flat;
    return flat.filter(
      (item) => item.name.toLowerCase().includes(keyword) || item.path.toLowerCase().includes(keyword),
    );
  }, [flat, query]);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setRenaming(null);
      setPendingDelete(null);
      setDraftName('');
      setQuery('');
      setSelectedPaths([]);
      setBatchConfirm(false);
    }
  }, [open]);

  if (!open) return null;

  const rowBtn = 'rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-white';

  return (
    <>
      <Overlay onClose={onClose}>
        <Panel className="max-w-lg">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{tr('文件夹管理')}</h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">共 {flat.length} 个文件夹 · 删除只移除整理结构，不会删除本地文件</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('关闭')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-white/5 px-5 py-2.5">
            <input
              data-testid="manager-folder-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr('搜索分组名称…')}
              className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            {creating ? (
              <>
                <input
                  autoFocus
                  data-testid="manager-new-folder-input"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCreating(false);
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void createFolder(draftName).then((ok) => {
                        if (ok) {
                          setCreating(false);
                          setDraftName('');
                        }
                      });
                    }
                  }}
                  placeholder={tr('新建文件夹名称')}
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-cyan-400/60"
                />
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={async () => {
                    const ok = await createFolder(draftName);
                    if (ok) {
                      setCreating(false);
                      setDraftName('');
                    }
                  }}
                >
                  创建
                </button>
                <button type="button" className={ghostBtn} onClick={() => { setCreating(false); setDraftName(''); }}>{tr('取消')}</button>
              </>
            ) : (
              <button
                type="button"
                data-testid="manager-new-folder"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:text-white"
              >
                <FolderPlus className="h-3.5 w-3.5 text-cyan-400" />
                <span>{tr('新建文件夹')}</span>
              </button>
            )}
          </div>

          {shown.length > 0 && (
            <div className="flex items-center gap-2 border-b border-white/5 px-5 py-2">
              <button
                type="button"
                data-testid="manager-select-all"
                onClick={() =>
                  setSelectedPaths(
                    selectedPaths.length === shown.length ? [] : shown.map((item) => item.path),
                  )
                }
                className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/25 hover:text-white"
              >
                {selectedPaths.length === shown.length ? tr('取消全选') : tr('全选')}
              </button>
              <span className="text-[11px] text-zinc-500">
                {selectedPaths.length > 0 ? tr('已选 {n} 个分组', { n: selectedPaths.length }) : tr('可勾选多个分组批量处理')}
              </span>
              {selectedPaths.length > 0 && (
                <button
                  type="button"
                  data-testid="manager-batch-delete"
                  onClick={() => setBatchConfirm(true)}
                  className="ml-auto rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-[11px] text-rose-300 transition hover:bg-rose-900/50"
                >
                  {tr('删除选中的分组')}
                </button>
              )}
            </div>
          )}

          <div className="max-h-[46vh] overflow-y-auto px-3 py-2">
            {shown.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-zinc-600">
                {flat.length === 0
                  ? tr('还没有文件夹。导入视频时可以选择目标文件夹，或在此新建。')
                  : tr('没有匹配「{name}」的分组。', { name: query.trim() })}
              </p>
            )}
            {shown.map((item) => (
              <div
                key={item.path}
                data-testid="manager-folder-row"
                data-folder-path={item.path}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
                style={{ paddingLeft: `${8 + item.depth * 14}px` }}
              >
                <input
                  type="checkbox"
                  data-testid="manager-folder-check"
                  checked={selectedPaths.includes(item.path)}
                  onChange={(event) =>
                    setSelectedPaths((current) =>
                      event.target.checked
                        ? [...new Set([...current, item.path])]
                        : current.filter((path) => path !== item.path),
                    )
                  }
                  className="h-3.5 w-3.5 shrink-0 accent-cyan-500"
                  aria-label={tr('选择 {name}', { name: item.name })}
                />
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                {renaming === item.path ? (
                  <>
                    <input
                      autoFocus
                      data-testid="manager-rename-input"
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null);
                        if (event.key === 'Enter') {
                          void renameFolder(item.path, renameDraft).then((ok) => { if (ok) setRenaming(null); });
                        }
                      }}
                      className="min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white outline-none focus:border-cyan-400/60"
                    />
                    <button
                      type="button"
                      className="rounded-md p-1 text-cyan-400 hover:bg-white/10"
                      title={tr('保存')}
                      onClick={() => void renameFolder(item.path, renameDraft).then((ok) => { if (ok) setRenaming(null); })}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={rowBtn} title={tr('取消')} onClick={() => setRenaming(null)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300 hover:text-cyan-300"
                      title={item.path}
                      onClick={() => { setSelectedFolderPath(item.path); onClose(); showToast(`已进入「${item.name}」`); }}
                    >
                      {item.name}
                    </button>
                    <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500" title={tr('含子文件夹内的视频总数')}>
                      {item.node.videoCount}
                    </span>
                    <button
                      type="button"
                      className={rowBtn}
                      title={tr('重命名')}
                      onClick={() => { setRenaming(item.path); setRenameDraft(item.name); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={`${rowBtn} hover:bg-rose-950/60 hover:text-rose-300`}
                      title={tr('删除')}
                      onClick={() => {
                        const stats = getFolderStats(item.path);
                        setPendingDelete({ path: item.path, name: item.name, ...stats });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className={actionsRow}>
            <button type="button" className={ghostBtn} onClick={onClose}>{tr('关闭')}</button>
          </div>
        </Panel>
      </Overlay>

      <DeleteFolderDialog
        open={batchConfirm}
        folderName={
          selectedPaths.length === 1
            ? selectedPaths[0].split('/').pop() || selectedPaths[0]
            : tr('{n} 个分组', { n: selectedPaths.length })
        }
        videoCount={selectedPaths.reduce((sum, path) => sum + (getFolderStats(path)?.videos ?? 0), 0)}
        onCancel={() => setBatchConfirm(false)}
        onConfirm={(mode) => {
          const paths = [...selectedPaths];
          setBatchConfirm(false);
          setSelectedPaths([]);
          void (async () => {
            for (const path of paths) await deleteFolder(path, { videos: mode });
            showToast(
              mode === 'trash'
                ? tr('已移除 {n} 个分组，视频已移入回收区', { n: paths.length })
                : tr('已移除 {n} 个分组，视频已移到媒体库根目录', { n: paths.length }),
            );
          })();
        }}
      />

      <DeleteFolderDialog
        open={Boolean(pendingDelete)}
        folderName={pendingDelete?.name ?? ''}
        videoCount={pendingDelete?.videos ?? 0}
        subfolderCount={pendingDelete?.subfolders ?? 0}
        onCancel={() => setPendingDelete(null)}
        onConfirm={(mode) => {
          const target = pendingDelete;
          if (!target) return;
          setPendingDelete(null);
          void deleteFolder(target.path, { videos: mode }).then(() => {
            showToast(
              mode === 'trash'
                ? tr('已移除 {n} 个分组，视频已移入回收区', { n: 1 })
                : tr('已移除「{name}」，视频已移到媒体库根目录', { name: target.name }),
            );
          });
        }}
      />
    </>
  );
};
