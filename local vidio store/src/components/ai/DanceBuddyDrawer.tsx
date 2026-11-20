import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  X,
  Send,
  Key,
  ArrowRight,
  Film,
  Play,
  Check,
  ExternalLink,
  Mic,
  MicOff,
  Brain,
  LoaderCircle,
  Zap,
} from 'lucide-react';
import { useVideoStore } from '../../store/useVideoStore';
import { api } from '../../services/api/client';
import { observationService } from '../../services/storage/observationService';
import type { VideoItem, VideoObservation } from '../../types';
import {
  AI_PROVIDERS,
  type AISettings,
  type AIProviderId,
  getProviderPreset,
  isAIConfigured,
  loadAISettings,
  requestChatCompletion,
  saveAISettings,
  streamChatCompletion,
  testAIConnection,
} from '../../services/ai/llmClient';
import { useI18n } from '../../i18n/I18nContext';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  matchedVideos?: VideoItem[];
  timestamp: number;
}

const STORAGE_CHAT_KEY = 'dance_echo_ai_buddy_messages';

export const DanceBuddyDrawer: React.FC = () => {
  const { t, tr } = useI18n();
  const { isAIBuddyOpen, setIsAIBuddyOpen, videos, noteCounts, setCurrentVideo } = useVideoStore();

  // 多供应商可自定义接入配置（Gemini / DeepSeek / 任意 OpenAI 兼容服务）
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());

  const [isConfiguringKey, setIsConfiguringKey] = useState(false);
  const [draft, setDraft] = useState<AISettings>(() => loadAISettings());
  const [keySavedMessage, setKeySavedMessage] = useState(false);
  const [testState, setTestState] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message: string }>({
    status: 'idle',
    message: '',
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // 默认初始对话（对标 AiPrototype.jsx）
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHAT_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return [
      {
        id: 'init-1',
        role: 'ai',
        text: '嗨！我是你的专属舞蹈朋友（Dance Buddy）。我记得你在练什么，也懂身体重心、发力感和动作要领。\n\n你可以让我帮你从本地视频库找练习、总结你在视频上的观察心得，或是随时交流动作难点！',
        timestamp: Date.now(),
      },
    ];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (isAIBuddyOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAIBuddyOpen]);

  // 持久化聊天历史
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  // 语音识别支持（Web Speech API）
  const toggleSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的浏览器暂不支持原生语音识别，推荐使用 Chrome 或 Edge 浏览器体验。');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const handleSaveSettings = () => {
    const clean: AISettings = {
      ...draft,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim() || getProviderPreset(draft.provider).defaultModel,
      baseUrl: draft.baseUrl.trim() || getProviderPreset(draft.provider).defaultBaseUrl,
    };
    setSettings(clean);
    saveAISettings(clean);
    setKeySavedMessage(true);
    setTimeout(() => {
      setKeySavedMessage(false);
      setIsConfiguringKey(false);
    }, 900);
  };

  const handleTestConnection = async () => {
    setTestState({ status: 'testing', message: '正在测试连通性…' });
    const result = await testAIConnection({
      ...draft,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim() || getProviderPreset(draft.provider).defaultModel,
      baseUrl: draft.baseUrl.trim() || getProviderPreset(draft.provider).defaultBaseUrl,
    });
    setTestState({ status: result.ok ? 'ok' : 'fail', message: result.message });
  };

  const handleProviderChange = (id: AIProviderId) => {
    const preset = getProviderPreset(id);
    setDraft((prev) => ({
      ...prev,
      provider: id,
      model: preset.defaultModel,
      baseUrl: preset.defaultBaseUrl,
    }));
    setTestState({ status: 'idle', message: '' });
  };

  // ── 核心能力 A: 本地视频库自然语言分析与推荐 ──────────────────────────────
  const analyzeAndFindVideos = (query: string): VideoItem[] => {
    const q = query.toLowerCase();
    const matched: VideoItem[] = [];

    // 关键词分析
    for (const v of videos) {
      const name = v.name.toLowerCase();
      const tags = (v.tags || []).map((t) => t.toLowerCase());
      const path = (v.path || '').toLowerCase();
      const category = (v.category || '').toLowerCase();

      let score = 0;

      // 舞种直接匹配
      const genres = ['kpop', 'hiphop', 'jazz', 'urban', 'popping', 'locking', 'breaking', '编舞', '律动', '步法', '波浪'];
      for (const g of genres) {
        if (q.includes(g)) {
          if (name.includes(g) || tags.some((t) => t.includes(g)) || path.includes(g)) {
            score += 3;
          }
        }
      }

      // 状态与属性匹配
      if (q.includes('留言') || q.includes('打点') || q.includes('笔记') || q.includes('重点')) {
        if ((noteCounts[v.id] ?? 0) > 0) score += 4;
      }
      if (q.includes('星标') || q.includes('最喜欢') || q.includes('高分') || q.includes('精选')) {
        if ((v.rating || 0) >= 4) score += 4;
      }
      if (q.includes('最近') || q.includes('新导入')) {
        score += 1;
      }

      // 文本模糊包含
      const words = q.split(/\s+/).filter((w) => w.length >= 2);
      for (const word of words) {
        if (name.includes(word) || tags.some((t) => t.includes(word)) || path.includes(word) || category.includes(word)) {
          score += 2;
        }
      }

      if (score > 0) {
        matched.push(v);
      }
    }

    // 按匹配度/评级排序返回前 4 个
    return matched.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
  };

  // ── 核心能力 B: 心得与动作要领智能总结 ────────────────────────────────────
  const generateObservationSummary = async (): Promise<string> => {
    try {
      // 以服务端为权威来源；离线时退回本地 Dexie 缓存
      let observations: VideoObservation[] = [];
      try {
        const { observations: serverObs } = await api.allObservations();
        observations = serverObs.map((item) => ({
          id: item.id,
          videoId: item.videoId,
          timestamp: item.time || undefined,
          content: item.text,
          tag: item.kind && item.kind !== 'note' ? item.kind : undefined,
          createdAt: item.createdAt,
          serverId: item.id,
        }));
      } catch {
        observations = await observationService.getAllObservations();
      }
      const totalNotes = observations.length;

      if (totalNotes === 0) {
        return (
          `回顾了你的练习记录：\n` +
          `📝 目前你尚未在视频中写下心得观察。\n\n` +
          `💡 **舞伴建议**：\n` +
          `在播放视频时，可以点击右侧的【观察心得】，写下你当时的真实发力感（例如：“重心回收太慢”、“肩膀没沉下去”、“转身时眼睛先看哪里”）。\n\n` +
          `只要开始记录第一条，肌肉直觉就会被真正沉淀下来！`
        );
      }

      // 聚类提取关键词
      const tagCounts: Record<string, number> = {};
      const words: string[] = [];
      for (const obs of observations) {
        if (obs.tag) {
          tagCounts[obs.tag] = (tagCounts[obs.tag] || 0) + 1;
        }
        words.push(obs.content);
      }

      const recentNotes = observations.slice(-3).map((o) => `• "${o.content}"`).join('\n');
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => `#${t}`)
        .join(' ');

      return (
        `这个月你已经留下了 **${totalNotes} 条观察笔记**！\n\n` +
        `🎯 **近期核心关注领域**：${topTags || '身体发力与重心'}\n\n` +
        `📌 **最近几条身体回馈**：\n${recentNotes}\n\n` +
        `✨ **舞伴心法总结**：\n` +
        `你已经不再只记录“哪里没跟上”，而是开始感受骨盆重量、呼吸停顿和音乐之间的关系。\n` +
        `在下次练习中，建议放慢 0.75x 速度，先让脚底的重心走稳，上半身晚半拍跟随，你会发现动作质感更干净！`
      );
    } catch {
      return '汇总笔记时遇到了一点小波折，但只要持续保持观察，身体就会给你最真诚的答案！';
    }
  };

  // ── 核心能力 C: 舞者即时问答（流式调用多供应商接口 或 本地知识引擎）──────────
  const requestAIResponse = async (
    userPrompt: string,
    onDelta?: (full: string) => void,
  ): Promise<{ text: string; matchedVideos?: VideoItem[] }> => {
    const isSearchIntent =
      userPrompt.includes('找') ||
      userPrompt.includes('搜') ||
      userPrompt.includes('练习') ||
      userPrompt.includes('推荐') ||
      userPrompt.includes('视频') ||
      userPrompt.includes('哪个');

    const isSummaryIntent =
      userPrompt.includes('心得') ||
      userPrompt.includes('总结') ||
      userPrompt.includes('观察') ||
      userPrompt.includes('复盘') ||
      userPrompt.includes('笔记');

    let matchedVideos: VideoItem[] | undefined;

    if (isSearchIntent) {
      const found = analyzeAndFindVideos(userPrompt);
      if (found.length > 0) {
        matchedVideos = found;
      }
    }

    const configured = isAIConfigured(settings);

    if (isSummaryIntent && !configured) {
      const summaryText = await generateObservationSummary();
      return { text: summaryText, matchedVideos };
    }

    // 已配置供应商（Gemini / DeepSeek / 自定义 OpenAI 兼容）→ 发起在线推理
    if (configured) {
      try {
        const videoLibraryContext = videos.slice(0, 15).map((v) => ({
          name: v.name,
          tags: v.tags,
          path: v.path,
          duration: `${Math.round(v.duration)}s`,
          noteCount: noteCounts[v.id] ?? 0,
        }));

        const systemPrompt =
          `你是一位富有洞察力、温暖且专业的街舞与现代舞动作导师（Dance Buddy 舞蹈朋友）。` +
          `你精通运动解剖学、身体重心分配、动力链传导、肌肉发力、音乐律动（Bounce, Groove, Isolation）与扒舞复盘策略。` +
          `你的语气鼓励舞者，对标 Dance Echo 的极简暗黑工坊美学，给出具体可感知的身体发力建议，不要空洞说教。` +
          `当前用户本地库共有 ${videos.length} 个视频片段，部分视频列表：${JSON.stringify(videoLibraryContext)}。` +
          `请简明精要地回答舞者的问题，必要时结合具体动作给出 1~3 条身体体感指引。`;

        const replyText = await streamChatCompletion(
          settings,
          {
            system: systemPrompt,
            user: `舞者提问：${userPrompt}`,
            maxTokens: 800,
          },
          { onDelta: (_delta, full) => onDelta?.(full) },
        );

        if (!onDelta) return { text: replyText, matchedVideos };
        return { text: replyText, matchedVideos };
      } catch (err: any) {
        const message = err?.message || '在线模型调用失败';
        // 流式失败时再尝试一次非流式（部分代理不支持 stream）
        try {
          const videoLibraryContext = videos.slice(0, 15).map((v) => ({
            name: v.name,
            tags: v.tags,
            path: v.path,
          }));
          const replyText = await requestChatCompletion(settings, {
            system: `你是专业的舞蹈动作导师。当前本地库共 ${videos.length} 个片段：${JSON.stringify(videoLibraryContext)}`,
            user: `舞者提问：${userPrompt}`,
            maxTokens: 700,
          });
          if (replyText) return { text: replyText, matchedVideos };
        } catch {
          /* 继续走本地兜底 */
        }
        return {
          text:
            `⚠️ 在线模型调用失败：${message}\n\n` +
            `可在右上角「API 接入」里切换供应商（Gemini / DeepSeek / 自定义 OpenAI 兼容），或点「测试连接」排查。\n\n` +
            `我先把本地知识引擎的建议给你：\n\n` +
            `• 慢放到 0.5x 先看清重心转移的起点；\n` +
            `• 在难点处打一个书签，写下"第几拍、哪只脚承重"；\n` +
            `• 恢复原速再合音乐，感受发力点有没有提前半拍。`,
          matchedVideos,
        };
      }
    }

    // ── 本地离线智能知识库引擎（无需 API Key，即开即用） ──────────────────
    if (matchedVideos && matchedVideos.length > 0) {
      return {
        text: `我为你从本地视频库中筛选出了 ${matchedVideos.length} 个契合的练习片段！你可以直接点击卡片上的【立即练习】开始扒舞对照：`,
        matchedVideos,
      };
    }

    if (userPrompt.includes('转身') || userPrompt.includes('看哪里')) {
      return {
        text:
          `看转身动作时，可以先看**脚下的重量有没有提前离开**。\n\n` +
          `💡 **体感要领**：\n` +
          `1. **视线留头 (Spotting)**：转动前找准视线锚点，身体先走，头留在最后快速甩回；\n` +
          `2. **轴心直立**：头顶像有一根线向上拉扯，肩膀自然沉下，不要缩脖子；\n` +
          `3. **重心下沉**：脚掌内侧抓地，上半身会晚半拍告诉你旋转的弧度。`,
      };
    }

    if (userPrompt.includes('10分钟') || userPrompt.includes('练习计划') || userPrompt.includes('建议')) {
      return {
        text:
          `给你制定一个 **10 分钟聚焦动作计划**：\n\n` +
          `⏱️ **0~3 分钟**：打开镜像翻转，0.5x 慢放看清重心的每一步转换轨迹；\n` +
          `⏱️ **3~7 分钟**：圈定难点区间开启 AB 循环，不听音乐只跟口令，重复 10 遍肌肉记忆；\n` +
          `⏱️ **7~10 分钟**：恢复原速，在动作难点处打一个书签并写下此时身体的感觉！`,
      };
    }

    if (userPrompt.includes('律动') || userPrompt.includes('bounce') || userPrompt.includes('groove')) {
      return {
        text:
          `律动的核心不是膝盖弯曲，而是**骨盆与横膈膜的呼吸下潜**。\n\n` +
          `• **Down Bounce**：在重拍时想象腹部微收、重力将身体吸入地板；\n` +
          `• **Up Bounce**：先压下去再自然回弹，膝盖保持微弹簧微屈，不要锁死关节；\n` +
          `• 试着在 Dance Echo 中开启 2D 骨骼发光，观察膝盖与髋关节的折叠夹角！`,
      };
    }

    return {
      text:
        `我收到了你的想法！每一次和身体对话，都在建立更深的动作控制力。\n\n` +
        `你可以试着问我：\n` +
        `• “帮我从视频库找节奏感强的练习”\n` +
        `• “总结我的练舞心得与观察笔记”\n` +
        `• “这个动作应该先看哪里？”\n\n` +
        `💡 *提示：点击右上角【API 接入】即可选择 Gemini / DeepSeek / 自定义 OpenAI 兼容服务，填入 Key 后解锁生成式实时舞伴。*`,
    };
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);
    setIsStreaming(false);

    // 流式占位消息：首个增量到达时插入，之后原地更新，避免整块闪烁
    const streamId = `ai-stream-${Date.now()}`;
    let streamStarted = false;

    const handleDelta = (full: string) => {
      if (!full) return;
      if (!streamStarted) {
        streamStarted = true;
        setIsStreaming(true);
        setMessages((prev) => [
          ...prev,
          { id: streamId, role: 'ai', text: full, timestamp: Date.now() },
        ]);
        return;
      }
      setMessages((prev) => prev.map((msg) => (msg.id === streamId ? { ...msg, text: full } : msg)));
    };

    try {
      const res = await requestAIResponse(text, handleDelta);
      if (streamStarted) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamId ? { ...msg, text: res.text, matchedVideos: res.matchedVideos } : msg,
          ),
        );
      } else {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: res.text,
          matchedVideos: res.matchedVideos,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'ai',
        text: '遇到了网络或计算异常，但我一直在陪着你。请重试一下。',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev.filter((msg) => msg.id !== streamId), errorMsg]);
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  if (!isAIBuddyOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-testid="ai-chat-window"
      className="fixed bottom-[76px] right-3 z-[90] animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex h-[min(38rem,calc(100dvh-96px))] max-h-[calc(100dvh-96px)] w-[min(24rem,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl">
        {/* ── 顶部标题与设置栏 ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-zinc-950/40 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h3>{tr('AI 对话')}</h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              data-testid="ai-settings-toggle"
              onClick={() => {
                setDraft(settings);
                setTestState({ status: 'idle', message: '' });
                setIsConfiguringKey((v) => !v);
              }}
              title={
                isAIConfigured(settings)
                  ? `AI 接入：${getProviderPreset(settings.provider).label} · ${settings.model}`
                  : 'AI 接入设置（Gemini / DeepSeek / 自定义）'
              }
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition ${
                isConfiguringKey
                  ? 'bg-cyan-900/60 text-cyan-300'
                  : isAIConfigured(settings)
                  ? 'text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isAIConfigured(settings) ? getProviderPreset(settings.provider).label : 'API 接入'}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isAIConfigured(settings) ? 'bg-emerald-400' : 'bg-zinc-600'
                }`}
              />
            </button>
            <button
              onClick={() => setIsAIBuddyOpen(false)}
              aria-label={tr('关闭 AI 对话')}
              title={tr('关闭')}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── API 接入设置（多供应商可自定义）────────────────────────────── */}
        {isConfiguringKey && (
          <div
            data-testid="ai-settings-panel"
            className="max-h-[20rem] overflow-y-auto border-b border-cyan-500/20 bg-zinc-950/80 p-3 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                <Brain className="w-4 h-4" />
                <span>{tr('API 接入设置')}</span>
              </div>
              {getProviderPreset(draft.provider).docsUrl && (
                <a
                  href={getProviderPreset(draft.provider).docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-zinc-400 transition hover:text-cyan-300"
                >
                  <span>{getProviderPreset(draft.provider).docsLabel}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* 供应商切换 */}
            <div className="grid grid-cols-3 gap-1.5">
              {AI_PROVIDERS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`ai-provider-${preset.id}`}
                  onClick={() => handleProviderChange(preset.id)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                    draft.provider === preset.id
                      ? 'border-cyan-400/60 bg-cyan-950/70 text-cyan-300'
                      : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {preset.label.replace(' (OpenAI 兼容)', '')}
                </button>
              ))}
            </div>

            <p className="text-[11px] leading-relaxed text-zinc-500">
              {getProviderPreset(draft.provider).description}
              {getProviderPreset(draft.provider).proxyHint ? ` ${getProviderPreset(draft.provider).proxyHint}` : ''}
            </p>

            {/* 模型 */}
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{tr('模型')}</span>
              <div className="flex gap-1.5">
                <input
                  data-testid="ai-model-input"
                  value={draft.model}
                  onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder={getProviderPreset(draft.provider).defaultModel}
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
                />
                {getProviderPreset(draft.provider).models.map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, model }))}
                    className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] transition ${
                      draft.model === model
                        ? 'border-cyan-400/50 bg-cyan-950/60 text-cyan-300'
                        : 'border-white/10 bg-zinc-900 text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    {model.replace('deepseek-', 'ds-').replace('gemini-', '')}
                  </button>
                ))}
              </div>
            </label>

            {/* Base URL */}
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                接口地址 (Base URL)
              </span>
              <input
                data-testid="ai-baseurl-input"
                value={draft.baseUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder={getProviderPreset(draft.provider).defaultBaseUrl}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
              />
            </label>

            {/* API Key */}
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">API Key</span>
              <input
                data-testid="ai-key-input"
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={getProviderPreset(draft.provider).keyPlaceholder}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-cyan-400 focus:outline-none"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="ai-save-settings"
                onClick={handleSaveSettings}
                className="flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-cyan-600/30 transition hover:bg-cyan-500"
              >
                {keySavedMessage ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{keySavedMessage ? '已保存' : '保存'}</span>
              </button>
              <button
                type="button"
                data-testid="ai-test-connection"
                onClick={handleTestConnection}
                disabled={testState.status === 'testing'}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
              >
                {testState.status === 'testing' ? (
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{testState.status === 'testing' ? '测试中…' : '测试连接'}</span>
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-[10px] ${
                  testState.status === 'ok'
                    ? 'text-emerald-400'
                    : testState.status === 'fail'
                    ? 'text-rose-400'
                    : 'text-zinc-600'
                }`}
                title={testState.message}
              >
                {testState.message || 'Key 仅存本地，不经服务器中转'}
              </span>
            </div>
          </div>
        )}

        {/* ── 对话消息区 ─────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          {/* 对话列表 */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div className="flex items-center gap-1 text-[10px] text-zinc-500 px-1 font-mono">
                {msg.role === 'ai' ? '舞蹈朋友 (Dance Buddy)' : '你'}
              </div>

              <div
                className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20 rounded-tr-sm'
                    : 'bg-zinc-800/80 border border-white/[0.06] text-zinc-200 rounded-tl-sm shadow-md'
                }`}
              >
                {msg.text}
                {msg.id.startsWith('ai-stream-') && isStreaming && (
                  <span className="ml-0.5 inline-block animate-pulse text-cyan-400">▍</span>
                )}
              </div>

              {/* 嵌入的推荐视频卡片 */}
              {msg.matchedVideos && msg.matchedVideos.length > 0 && (
                <div className="w-full space-y-2 mt-2">
                  <div className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                    <Film className="w-3 h-3" />
                    <span>{tr('推荐练习片段：')}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {msg.matchedVideos.map((video) => (
                      <div
                        key={video.id}
                        className="p-2.5 rounded-xl bg-zinc-950/80 border border-white/[0.08] hover:border-cyan-500/40 transition flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 flex items-center justify-center border border-white/5">
                            {video.thumbnailUrl ? (
                              <img
                                src={video.thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Film className="w-5 h-5 text-zinc-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-semibold text-white truncate group-hover:text-cyan-300 transition">
                              {video.name}
                            </h5>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                              <span>{Math.round(video.duration)}秒</span>
                              {video.tags?.[0] && <span>#{video.tags[0]}</span>}
                              {video.rating ? <span>⭐{video.rating}</span> : null}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setCurrentVideo(video);
                            setIsAIBuddyOpen(false);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-[11px] font-medium transition shadow-md shadow-cyan-600/20 flex-shrink-0 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{tr('练这个')}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/40 p-3 rounded-2xl w-fit animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
              <span>{tr('舞伴正在思考动作要领与分析视频库...')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── 快捷提问推荐气泡（对标 AiPrototype.jsx） ────────────────────── */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-zinc-950/30">
          <div className="text-[10px] font-mono text-zinc-500 mb-1.5 flex items-center justify-between">
            <span>{tr('你可以直接点选：')}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleSendMessage('帮我从视频库找节奏感强的练习')}
              className="px-2.5 py-1 rounded-full text-[11px] bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('找高节奏练习')}</span>
              <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
            </button>
            <button
              onClick={() => handleSendMessage('总结我的练习心得与观察笔记')}
              className="px-2.5 py-1 rounded-full text-[11px] bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('总结我的心得')}</span>
              <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
            </button>
            <button
              onClick={() => handleSendMessage('这个转身应该先看哪里？')}
              className="px-2.5 py-1 rounded-full text-[11px] bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('转身发力点')}</span>
              <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
            </button>
            <button
              onClick={() => handleSendMessage('给我一个 10 分钟专项练习建议')}
              className="px-2.5 py-1 rounded-full text-[11px] bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('10m 练习计划')}</span>
              <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
            </button>
          </div>
        </div>

        {/* ── 底部输入交互条 ─────────────────────────────────────────────── */}
        <div className="p-3 border-t border-white/[0.08] bg-zinc-950/60">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              title={isListening ? '正在聆听语音...' : '点击语音输入'}
              className={`p-2 rounded-xl transition ${
                isListening
                  ? 'bg-red-950 text-red-400 border border-red-500/40 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {isListening ? <Mic className="w-4 h-4 text-red-400" /> : <MicOff className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={tr('和舞蹈朋友聊聊（如：帮我找练舞视频，或问动作发力）...')}
              className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white transition shadow-lg shadow-cyan-600/30 cursor-pointer flex-shrink-0"
              title={tr('发送')}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DanceBuddyDrawer;
