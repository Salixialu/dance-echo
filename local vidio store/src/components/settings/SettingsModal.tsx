import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  Music4,
  Gauge,
  Info,
  Check,
  Loader2,
  LoaderCircle,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Server,
  HardDrive,
  FolderOpen,
  Download,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  Tags,
  Plus,
} from 'lucide-react';
import {
  AI_PROVIDERS,
  getProviderPreset,
  loadAISettings,
  saveAISettings,
  testAIConnection,
  type AISettings,
  type AIProviderId,
} from '../../services/ai/llmClient';
import { songService } from '../../services/music/songService';
import {
  loadPreferences,
  savePreferences,
  type PoseQuality,
  type TagPresetGroup,
  DEFAULT_TAG_PRESETS,
} from '../../services/settings/appPreferences';
import { useI18n } from '../../i18n/I18nContext';
import { api } from '../../services/api/client';
import {
  downloadBlob,
  exportLibrary,
  findOrphanRecords,
  formatBytes,
  getStorageStatus,
  importLibrary,
  removeOrphanRecords,
  requestPersistentStorage,
  type StorageStatus,
} from '../../services/storage/storageManager';

export type SettingsTab = 'ai' | 'music' | 'performance' | 'tags' | 'storage' | 'about';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'ai', label: 'AI 助手', icon: <Sparkles className="w-4 h-4" />, hint: '舞蹈朋友的大脑' },
  { id: 'music', label: '歌曲识别', icon: <Music4 className="w-4 h-4" />, hint: '自动听出舞曲' },
  { id: 'performance', label: '识别性能', icon: <Gauge className="w-4 h-4" />, hint: '骨架跟随速度' },
  { id: 'tags', label: '标签预设', icon: <Tags className="w-4 h-4" />, hint: '老师 / 舞种 / 来源' },
  { id: 'storage', label: '存储与备份', icon: <HardDrive className="w-4 h-4" />, hint: '容量 / 持久化 / 备份' },
  { id: 'about', label: '关于', icon: <Info className="w-4 h-4" />, hint: '版本与数据' },
];

const inputClass =
  'w-full h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]';
const labelClass = 'text-[11px] font-medium text-zinc-400';
const primaryBtnClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-medium text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const ghostBtnClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

export default function SettingsModal({ open, onClose, initialTab = 'ai' }: SettingsModalProps) {
  const { t, tr } = useI18n();
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={tr('设置')}
        data-testid="settings-modal"
        className="relative flex w-[min(820px,94vw)] max-h-[86vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)]"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{tr('设置')}</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              配置与密钥只保存在本机浏览器；视频与练习元数据由本机 DanceEcho Server 保存
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="settings-close"
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            aria-label={tr('关闭设置')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 border-r border-white/[0.06] p-2">
            {TABS.map((item) => {
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`settings-tab-${item.id}`}
                  onClick={() => setTab(item.id)}
                  className={`mb-1 flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                    active
                      ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-400/20'
                      : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{item.label}</span>
                    <span className="block truncate text-[10px] text-zinc-500">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === 'ai' && <AISettingsPanel />}
            {tab === 'music' && <MusicRecognitionPanel />}
            {tab === 'performance' && <PerformancePanel />}
        {tab === 'tags' && <TagPresetPanel onChanged={() => window.dispatchEvent(new Event('danceecho:tags-changed'))} />}
            {tab === 'storage' && <StoragePanel />}
            {tab === 'about' && <AboutPanel />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------- AI 助手 ------------------------------- */

function AISettingsPanel() {
  const { tr } = useI18n();
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [savedTip, setSavedTip] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const preset = getProviderPreset(settings.provider);

  const switchProvider = (id: AIProviderId) => {
    const next = getProviderPreset(id);
    setSettings((prev) => ({
      ...prev,
      provider: id,
      model: next.defaultModel,
      baseUrl: next.defaultBaseUrl,
    }));
    setSavedTip('');
    setTestResult(null);
  };

  const handleSave = () => {
    saveAISettings(settings);
    setSavedTip('已保存');
    setTimeout(() => setSavedTip(''), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testAIConnection(settings);
    setTestResult({ ok: result.ok, message: result.message });
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className={labelClass}>{tr('服务提供方')}</div>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {AI_PROVIDERS.map((item) => {
            const active = item.id === settings.provider;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`ai-provider-${item.id}`}
                onClick={() => switchProvider(item.id)}
                className={`rounded-xl border px-2.5 py-2 text-left transition ${
                  active
                    ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                    : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-xs font-medium">{item.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {preset.models.length > 0 && (
        <div>
          <div className={labelClass}>{tr('模型')}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {preset.models.map((model) => {
              const active = model === settings.model;
              return (
                <button
                  key={model}
                  type="button"
                  data-testid={`ai-model-${model}`}
                  onClick={() => setSettings((prev) => ({ ...prev, model }))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    active
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {model}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="settings-ai-model">
          模型名称
        </label>
        <input
          id="settings-ai-model"
          data-testid="settings-ai-model-input"
          className={inputClass}
          value={settings.model}
          onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
          placeholder={preset.defaultModel}
        />
      </div>

      <div>
        <label
          className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-400"
          htmlFor="settings-ai-baseurl"
        >
          <Server className="w-3 h-3" /> 接口地址 (Base URL)
        </label>
        <input
          id="settings-ai-baseurl"
          data-testid="settings-ai-baseurl-input"
          className={inputClass}
          value={settings.baseUrl}
          onChange={(event) => setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))}
          placeholder={preset.defaultBaseUrl}
        />
        {preset.proxyHint && <p className="mt-1 text-[10px] text-zinc-500">{preset.proxyHint}</p>}
      </div>

      <div>
        <label
          className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-400"
          htmlFor="settings-ai-key"
        >
          <KeyRound className="w-3 h-3" /> API Key
        </label>
        <input
          id="settings-ai-key"
          data-testid="settings-ai-key-input"
          type="password"
          className={inputClass}
          value={settings.apiKey}
          onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
          placeholder={preset.keyPlaceholder}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">{tr('仅保存在本机 localStorage')}</span>
          {preset.docsUrl && (
            <a
              href={preset.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-cyan-400 hover:text-cyan-300"
            >
              {preset.docsLabel}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          data-testid="settings-ai-save"
          className={primaryBtnClass}
          onClick={handleSave}
        >
          <Check className="w-3.5 h-3.5" /> 保存
        </button>
        <button
          type="button"
          data-testid="settings-ai-test"
          className={ghostBtnClass}
          onClick={handleTest}
          disabled={testing || !settings.apiKey.trim()}
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          测试连接
        </button>
        {savedTip && <span className="text-[11px] text-emerald-400">{savedTip}</span>}
      </div>

      {testResult && (
        <p
          data-testid="settings-ai-test-result"
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
            testResult.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
          }`}
        >
          {testResult.message}
        </p>
      )}

      <p className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
        没有 Key 也能用：舞蹈朋友内置本地规则引擎，可回答"怎么练/今天练什么"等常见问题；
        配置 Key 后会改成真实大模型对话，支持流式输出。
      </p>
    </div>
  );
}

/* ------------------------------ 歌曲识别 ------------------------------ */

function MusicRecognitionPanel() {
  const { tr } = useI18n();
  const initial = songService.getACRCloudConfig();
  const [host, setHost] = useState(initial.config.host);
  const [accessKey, setAccessKey] = useState(initial.config.accessKey);
  const [accessSecret, setAccessSecret] = useState(initial.config.accessSecret);
  const [configured, setConfigured] = useState(initial.isConfigured);
  const [savedTip, setSavedTip] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = () => {
    songService.saveACRCloudConfig({ host, accessKey, accessSecret });
    const next = songService.getACRCloudConfig();
    setConfigured(next.isConfigured);
    setSavedTip('已保存');
    setTimeout(() => setSavedTip(''), 2000);
  };

  const handleTest = async () => {
    songService.saveACRCloudConfig({ host, accessKey, accessSecret });
    setConfigured(songService.getACRCloudConfig().isConfigured);
    setTesting(true);
    setTestResult(null);
    const result = await songService.testACRCloudConnection();
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music4 className="w-4 h-4 text-cyan-300" />
            <span className="text-xs font-medium text-zinc-200">{tr('ACRCloud 听歌识曲')}</span>
          </div>
          <span
            data-testid="acr-status"
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              configured
                ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/30'
                : 'bg-zinc-700/40 text-zinc-400 ring-1 ring-inset ring-white/10'
            }`}
          >
            {configured ? '已配置' : '未配置'}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          播放器右侧「音乐」面板里的<b className="text-zinc-300">{tr('听音识曲')}</b>
          ，会用 ACRCloud 指纹库识别你放的这段舞曲，自动绑定曲名/BPM/歌手。
          国内节点直连，注册后每月 10000 次免费额度；不配置则只能手动搜索或手填。
        </p>
        <a
          href="https://console.acrcloud.cn/console/audio-file-recognition"
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-0.5 text-[10px] text-cyan-400 hover:text-cyan-300"
        >
          去 ACRCloud 控制台拿 Host / Access Key / Secret
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="acr-host">
          识别 Host
        </label>
        <input
          id="acr-host"
          data-testid="acr-host-input"
          className={inputClass}
          value={host}
          onChange={(event) => setHost(event.target.value)}
          placeholder="identify-cn-north-1.acrcloud.cn"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="acr-key">
          Access Key
        </label>
        <input
          id="acr-key"
          data-testid="acr-key-input"
          className={inputClass}
          value={accessKey}
          onChange={(event) => setAccessKey(event.target.value)}
          placeholder="ACRCloud Access Key"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="acr-secret">
          Access Secret
        </label>
        <input
          id="acr-secret"
          data-testid="acr-secret-input"
          type="password"
          className={inputClass}
          value={accessSecret}
          onChange={(event) => setAccessSecret(event.target.value)}
          placeholder="ACRCloud Access Secret"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="acr-save"
          className={primaryBtnClass}
          onClick={handleSave}
        >
          <Check className="w-3.5 h-3.5" /> 保存
        </button>
        <button
          type="button"
          data-testid="acr-test"
          className={ghostBtnClass}
          onClick={() => void handleTest()}
          disabled={testing}
        >
          <LoaderCircle className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          {testing ? '测试中...' : '测试连通'}
        </button>
        {savedTip && <span className="text-[11px] text-emerald-400">{savedTip}</span>}
      </div>

      {testResult && (
        <p
          data-testid="acr-test-result"
          className={`rounded-lg px-2.5 py-2 text-[10px] leading-relaxed ${
            testResult.ok
              ? 'bg-emerald-400/10 text-emerald-200 ring-1 ring-inset ring-emerald-400/30'
              : 'bg-rose-400/10 text-rose-200 ring-1 ring-inset ring-rose-400/30'
          }`}
        >
          {testResult.message}
        </p>
      )}

      <p className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-[10px] leading-relaxed text-zinc-500">
        {tr('测试连通会发送 2 秒静音样本：只要返回 1001 / 2004 / 2005，就说明 Host / Key / Secret 已通过认证（静音样本生成不了指纹，属于预期）。真实视频识别失败，多半是片段静音、没人声旋律，或这首歌不在 ACRCloud 曲库。')}
      </p>
    </div>
  );
}

/* ------------------------------ 识别性能 ------------------------------ */

function TagPresetPanel({ onChanged }: { onChanged?: () => void }) {
  const { tr } = useI18n();
  const [groups, setGroups] = useState<TagPresetGroup[]>(() => loadPreferences().tagPresets);
  const [dirtyTip, setDirtyTip] = useState('');

  const commit = (next: TagPresetGroup[]) => {
    setGroups(next);
    savePreferences({ tagPresets: next });
    setDirtyTip(tr('已保存'));
    window.setTimeout(() => setDirtyTip(''), 1200);
    onChanged?.();
  };

  const updateGroup = (index: number, patch: Partial<TagPresetGroup>) => {
    const next = groups.map((group, i) => (i === index ? { ...group, ...patch } : group));
    commit(next);
  };

  const [copiedTag, setCopiedTag] = useState('');
  const copyTag = async (group: TagPresetGroup, value: string) => {
    const tag = `${group.name}:${value}`;
    try {
      await navigator.clipboard.writeText(tag);
      setCopiedTag(tag);
      window.setTimeout(() => setCopiedTag(''), 1600);
    } catch {
      setCopiedTag(tag);
      window.setTimeout(() => setCopiedTag(''), 1600);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
        {tr(
          '这里的每个分类会出现在播放页「信息 → 标签」里，点一下就把「分类:值」写进标签，例如 老师:Kane、舞种:Jazz。逗号分隔多个值。',
        )}
        <div className="mt-1.5 text-zinc-500" data-testid="settings-tag-preset-legend">
          {tr('点一下复制「分类:值」，可直接粘贴到播放页标签；播放页也可以点选写入。')}
        </div>
        {dirtyTip ? <span className="ml-2 text-cyan-300">{dirtyTip}</span> : null}
      </div>

      {groups.map((group, index) => (
        <div
          key={group.name + "-" + index}
          className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
          data-testid="settings-tag-preset-row"
        >
          <div className="flex items-center gap-2">
            <input
              className={inputClass + ' h-8 max-w-[9rem]'}
              value={group.name}
              placeholder={tr('分类名，如 老师')}
              data-testid={"tag-preset-name-" + index}
              onChange={(event) => updateGroup(index, { name: event.target.value })}
            />
            <span className="text-[11px] text-zinc-600">:</span>
            <input
              className={inputClass + ' h-8 flex-1'}
              value={group.values.join(', ')}
              placeholder={tr('Kane, 饼饼, Jazz …')}
              data-testid={"tag-preset-values-" + index}
              onChange={(event) =>
                updateGroup(index, {
                  values: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
            <button
              type="button"
              className={ghostBtnClass + ' h-8 shrink-0'}
              data-testid={"tag-preset-remove-" + index}
              onClick={() => commit(groups.filter((_, i) => i !== index))}
              aria-label={tr('删除这个分类')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {group.values.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">{tr('点选写入标签：')}</span>
              {group.values.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`tag-preset-chip-${index}-${value}`}
                  onClick={() => copyTag(group, value)}
                  className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/20"
                  title={tr('复制为「分类:值」标签，粘贴到播放页标签输入框')}
                >
                  {value}
                </button>
              ))}
              {copiedTag ? <span className="text-[10px] text-cyan-300">{tr('已复制')} {copiedTag}</span> : null}
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryBtnClass}
          data-testid="tag-preset-add-group"
          onClick={() => commit([...groups, { name: tr('新分类'), values: [] }])}
        >
          <Plus className="h-3.5 w-3.5" />
          {tr('添加分类')}
        </button>
        <button
          type="button"
          className={ghostBtnClass}
          onClick={() => commit(DEFAULT_TAG_PRESETS.map((group) => ({ ...group, values: [...group.values] })))}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {tr('恢复默认')}
        </button>
      </div>
    </div>
  );
}
function PerformancePanel() {
  const { tr } = useI18n();
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const [dirty, setDirty] = useState(false);

  const apply = (next: Partial<typeof prefs>) => {
    const merged = savePreferences(next);
    setPrefs(merged);
    setDirty(true);
  };

  const qualityOptions: { id: PoseQuality; title: string; desc: string }[] = [
    {
      id: 'lite',
      title: '极速（Lite）',
      desc: '默认。单帧推理约快一倍，骨架跟手更好，适合长时间跟练。',
    },
    {
      id: 'full',
      title: '高精度（Full）',
      desc: '关键点更稳、抖动更少，但延迟更高，适合逐帧研究动作。',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className={labelClass}>{tr('姿态模型')}</div>
        <div className="mt-1.5 space-y-2">
          {qualityOptions.map((option) => {
            const active = prefs.poseQuality === option.id;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={`pose-quality-${option.id}`}
                onClick={() => apply({ poseQuality: option.id })}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${active ? 'text-cyan-200' : 'text-zinc-300'}`}>
                    {option.title}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{option.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        data-testid="multi-pose-toggle"
        onClick={() => apply({ allowMultiPose: !prefs.allowMultiPose })}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
      >
        <span>
          <span className="block text-xs font-medium text-zinc-200">{tr('多人识别（最多 2 人）')}</span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            合舞/齐舞时自动锁定画面里的主要舞者；单帧推理成本翻倍，会明显变卡
          </span>
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
            prefs.allowMultiPose ? 'bg-cyan-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              prefs.allowMultiPose ? 'left-4.5' : 'left-0.5'
            }`}
          />
        </span>
      </button>

      <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 text-amber-300" />
        <p className="text-[11px] text-amber-200/90">
          {dirty ? '设置已保存，模型需要刷新页面后才生效。' : '模型在页面加载时初始化，改动后需刷新生效。'}
        </p>
        <button
          type="button"
          data-testid="pose-reload"
          onClick={() => window.location.reload()}
          className="ml-auto shrink-0 rounded-md bg-amber-400/20 px-2 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/30"
        >
          立即刷新
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ 存储与备份 ------------------------------ */

function StoragePanel() {
  const { tr } = useI18n();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [server, setServer] = useState<{ count: number; totalBytes: number; scannedAt: string } | null>(null);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState<'' | 'persist' | 'export' | 'import' | 'cleanup'>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshServer = React.useCallback(async () => {
    try {
      const data = await api.library();
      setServer({ count: data.count, totalBytes: data.totalBytes, scannedAt: data.scannedAt ?? '' });
      setServerError('');
    } catch (err) {
      setServer(null);
      setServerError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      setStatus(await getStorageStatus());
    } catch (err) {
      setError(`读取存储状态失败：${err instanceof Error ? err.message : String(err)}`);
    }
    await refreshServer();
  }, [refreshServer]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePersist = async () => {
    setBusy('persist');
    setError('');
    try {
      const granted = await requestPersistentStorage();
      setMessage(
        granted
          ? '已获得持久化存储：浏览器不会在磁盘紧张时自动清除你的媒体库。'
          : '浏览器暂未授予持久化存储。Chrome / Edge 通常需要你先多使用几次本站，或在地址栏站点信息里手动允许。',
      );
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const handleExport = async () => {
    setBusy('export');
    setError('');
    try {
      const { blob, filename, counts } = await exportLibrary();
      downloadBlob(blob, filename);
      setMessage(
        `已导出备份：${counts.videos} 条视频记录、${counts.folders} 个分组（${formatBytes(blob.size)}）。备份含标签 / 留言 / 进度 / 分组 / 回收站 / 观察 / 练习记录，不含视频本体。`,
      );
    } catch (err) {
      setError(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy('import');
    setError('');
    try {
      const result = await importLibrary(file);
      if (result.error) {
        setError(`导入失败：${result.error}`);
      } else {
        const target =
          result.source === 'server' ? '已合并到服务端媒体库' : '仅恢复了浏览器缓存（服务端不可达）';
        setMessage(
          `备份恢复完成：${target}，合并 ${result.merged} 条，跳过 ${result.skipped} 条（库里没有对应视频）。共 ${result.total} 条。`,
        );
        await refresh();
        if (result.source === 'server') {
          window.dispatchEvent(new Event('danceecho:library-changed'));
        }
      }
    } catch (err) {
      setError(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCleanup = async () => {
    setBusy('cleanup');
    setError('');
    try {
      const orphans = await findOrphanRecords();
      if (!orphans.length) {
        setMessage('没有发现失效的本地记录，媒体库是干净的。');
        return;
      }
      const confirmed = window.confirm(
        `发现 ${orphans.length} 条旧版本地记录没有可播放的视频文件（服务端媒体库里的条目不算）。\n删除后这些记录的标签与留言会一并丢失，需要重新导入。\n\n确定删除吗？`,
      );
      if (!confirmed) return;
      const removed = await removeOrphanRecords(orphans.map((item) => item.id));
      setMessage(`已清理 ${removed} 条失效记录。`);
      await refresh();
    } catch (err) {
      setError(`清理失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {tr('正在读取存储状态…')}
      </div>
    );
  }

  const percent = status.quota > 0 ? Math.min(100, (status.usage / status.quota) * 100) : 0;
  const barColor =
    percent >= 90
      ? 'bg-rose-500'
      : percent >= 75
        ? 'bg-amber-400'
        : 'bg-cyan-400';

  const detailItems: { label: string; value: string }[] = [
    { label: '缓存视频记录', value: `${status.counts.videos} 条` },
    { label: '分组', value: `${status.counts.folders} 个` },
    { label: '骨架观察', value: `${status.counts.observations} 条` },
    { label: '练习打卡', value: `${status.counts.practiceLogs} 天` },
    { label: '本地副本大小', value: formatBytes(status.videoBytes) },
    { label: '封面占用（估算）', value: formatBytes(status.thumbnailBytes) },
  ];

  return (
    <div className="space-y-3 text-[11px] leading-relaxed text-zinc-400">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            {tr('媒体库（服务端）')}
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
              server
                ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25'
                : 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-400/20'
            }`}
          >
            {server ? tr('已连接') : serverError ? tr('未连接') : tr('读取中')}
          </span>
        </div>
        {server ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <div className="text-[10px] text-zinc-500">{tr('视频数')}</div>
              <div className="mt-0.5 font-mono text-[11px] text-zinc-200">{server.count}</div>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <div className="text-[10px] text-zinc-500">{tr('视频总大小')}</div>
              <div className="mt-0.5 font-mono text-[11px] text-zinc-200">{formatBytes(server.totalBytes)}</div>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <div className="text-[10px] text-zinc-500">{tr('最近扫描')}</div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-200">
                {server.scannedAt ? new Date(server.scannedAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            {serverError
              ? `未连接到 DanceEcho Server（${serverError}）。视频仍在磁盘上，启动服务端后这里会显示真实数量。`
              : '正在读取服务端媒体库…'}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          {tr('视频本体留在磁盘原位置，浏览器不复制；这里的数字来自服务端索引，与首页卡片一致。')}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            {tr('浏览器缓存')}
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
              status.persisted
                ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25'
                : 'bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-400/25'
            }`}
          >
            {status.persisted ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
            {status.persisted ? tr('已持久化') : tr('未持久化')}
          </span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(percent, 0.5)}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <span>
            {formatBytes(status.usage)} / {status.quota > 0 ? formatBytes(status.quota) : tr('配额未知')}
          </span>
          <span>{status.quota > 0 ? `${percent.toFixed(2)}%` : '—'}</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          {tr('缓存只保存索引、缩略图与旧版本地副本；清理浏览数据不会删除磁盘上的视频，重新扫描即可恢复。')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {detailItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
            <div className="text-[10px] text-zinc-500">{tr(item.label)}</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-200">{item.value}</div>
          </div>
        ))}
      </div>

      {status.orphanCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-[10px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <span>
            {tr('检测到 {n} 条记录找不到视频本体，可能是清理过浏览数据或原文件被改名。可以重新导入对应目录自动识别，或直接清理这些失效记录。', {
              n: status.orphanCount,
            })}
          </span>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="text-xs font-medium text-zinc-200">{tr('数据保护')}</div>
        <p className="mt-1 text-[10px] text-zinc-500">
          {tr('备份文件包含标签、书签、播放进度、分组、回收站、观察与练习记录，不含视频本体。恢复会写回服务端媒体库；服务端不可达时只恢复浏览器缓存，并会明确提示。')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryBtnClass}
            disabled={busy !== '' || !status.supported}
            onClick={handlePersist}
            data-testid="storage-persist"
          >
            {busy === 'persist' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {status.persisted ? tr('已持久化') : tr('申请持久化')}
          </button>
          <button
            type="button"
            className={ghostBtnClass}
            disabled={busy !== ''}
            onClick={handleExport}
            data-testid="storage-export"
          >
            {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {tr('导出备份')}
          </button>
          <button
            type="button"
            className={ghostBtnClass}
            disabled={busy !== ''}
            onClick={() => fileInputRef.current?.click()}
            data-testid="storage-import"
          >
            {busy === 'import' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {tr('恢复备份')}
          </button>
          <button
            type="button"
            className={ghostBtnClass}
            disabled={busy !== '' || status.orphanCount === 0}
            onClick={handleCleanup}
            data-testid="storage-cleanup"
          >
            {busy === 'cleanup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {tr('清理失效记录')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
        </div>
        {message && (
          <p className="mt-2 rounded-lg bg-emerald-500/[0.08] px-2.5 py-1.5 text-[10px] text-emerald-300/90">{message}</p>
        )}
        {error && (
          <p className="mt-2 rounded-lg bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-300/90">{error}</p>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-zinc-500">
        {tr('注意：127.0.0.1 与 localhost 在浏览器里是两个不同的存储源，媒体库不互通。请固定使用同一个地址打开，避免出现"数据不见了"。')}
      </div>
    </div>
  );
}

/* -------------------------------- 关于 -------------------------------- */

function AboutPanel() {
  const { tr } = useI18n();
  return (
    <div className="space-y-3 text-[11px] leading-relaxed text-zinc-400">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="text-xs font-medium text-zinc-200">{tr('Dance Echo · 舞韵回响')}</div>
        <div className="mt-1 font-mono text-[10px] text-zinc-500">{tr('v0.1.0 · 本地优先')}</div>
        <p className="mt-2">
          一款把"看视频学舞"做成闭环的本地工具：视频入库 / 分组 / 留言 / 骨架跟练 /
          节拍与舞曲绑定 / 练习记录。视频本体留在本机磁盘，标签、留言与练习记录由
          DanceEcho Server 保存（浏览器只做缓存）；两者都可以通过备份导出与恢复，
          不经过任何第三方服务器。
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="text-xs font-medium text-zinc-200">{tr('隐私说明')}</div>
        <p className="mt-1">
          AI 对话与歌曲识别仅在你填写对应 Key 后才启用，请求由浏览器直接发往你配置的服务商；
          Key 保存在 localStorage，可随时在这里删除。
        </p>
      </div>
    </div>
  );
}
