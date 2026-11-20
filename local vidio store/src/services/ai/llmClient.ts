/**
 * llmClient.ts — 统一的多供应商大模型接入层（纯前端，Key 只存本地）
 * 支持：
 *  • Google Gemini（浏览器直连，官方允许跨域）
 *  • DeepSeek（OpenAI 兼容，开发环境走 Vite 本地代理规避跨域）
 *  • 自定义 OpenAI 兼容服务（one-api / Ollama 代理 / 自建中转等）
 *
 * 设计原则：与市面上"可接入 API 的 AI 产品"对齐——供应商、模型、Base URL、Key 全部可自定义。
 */

export type AIProviderId = 'gemini' | 'deepseek' | 'custom';

export interface AIProviderPreset {
  id: AIProviderId;
  label: string;
  description: string;
  defaultModel: string;
  models: string[];
  defaultBaseUrl: string;
  keyPlaceholder: string;
  docsUrl: string;
  docsLabel: string;
  /** OpenAI 兼容协议 / Gemini 原生协议 */
  protocol: 'gemini' | 'openai';
  proxyHint?: string;
}

export const AI_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: '浏览器直连官方接口，无需代理。',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: '获取 Key',
    protocol: 'gemini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'OpenAI 兼容协议。开发模式下自动走本地代理，规避浏览器跨域限制。',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: '/api/llm/deepseek',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    docsLabel: '获取 Key',
    protocol: 'openai',
    proxyHint: '当前使用本地代理路径；若部署为静态站点，请改成你自己的中转地址。',
  },
  {
    id: 'custom',
    label: '自定义 (OpenAI 兼容)',
    description: '任何 OpenAI 兼容服务，例如 one-api / new-api / 自建中转 / 本地 Ollama 代理。',
    defaultModel: 'gpt-4o-mini',
    models: [],
    defaultBaseUrl: 'http://127.0.0.1:3000/v1',
    keyPlaceholder: 'sk-...',
    docsUrl: '',
    docsLabel: '',
    protocol: 'openai',
  },
];

export interface AISettings {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
}

const STORAGE_KEY = 'dance_echo_ai_settings';
const LEGACY_GEMINI_KEY = 'dance_echo_gemini_api_key';

const PRESET_MAP = new Map(AI_PROVIDERS.map((preset) => [preset.id, preset]));

export function getProviderPreset(id: AIProviderId): AIProviderPreset {
  return PRESET_MAP.get(id) || AI_PROVIDERS[0];
}

function presetDefaults(id: AIProviderId): AISettings {
  const preset = getProviderPreset(id);
  return {
    provider: id,
    apiKey: '',
    model: preset.defaultModel,
    baseUrl: preset.defaultBaseUrl,
    temperature: 0.7,
  };
}

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AISettings>;
      const provider = (parsed.provider as AIProviderId) || 'gemini';
      const preset = getProviderPreset(provider);
      return {
        provider,
        apiKey: parsed.apiKey || '',
        model: parsed.model || preset.defaultModel,
        baseUrl: parsed.baseUrl || preset.defaultBaseUrl,
        temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0.7,
      };
    }
    // 兼容旧版本：只存过 Gemini Key
    const legacy = localStorage.getItem(LEGACY_GEMINI_KEY);
    if (legacy) {
      return { ...presetDefaults('gemini'), apiKey: legacy };
    }
  } catch {
    /* ignore */
  }
  return presetDefaults('gemini');
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function isAIConfigured(settings: AISettings): boolean {
  return Boolean(settings.apiKey.trim() && settings.model.trim() && settings.baseUrl.trim());
}

export function providerLabel(id: AIProviderId): string {
  return getProviderPreset(id).label;
}

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export class AIRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AIRequestError';
    this.status = status;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function describeNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return '网络不可达或被浏览器跨域（CORS）拦截。请检查网络，或改用支持跨域的服务/自建中转。';
  }
  if (/timeout|aborted/i.test(message)) {
    return '请求超时。请检查网络，或换一个更快的模型。';
  }
  return message;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function callGemini(settings: AISettings, request: ChatRequest): Promise<string> {
  const base = normalizeBaseUrl(settings.baseUrl);
  const url = `${base}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${request.system}\n\n${request.user}` }] }],
        generationConfig: {
          temperature: request.temperature ?? settings.temperature,
          maxOutputTokens: request.maxTokens ?? 600,
        },
      }),
    },
    request.timeoutMs ?? 30000,
  );
  if (!response.ok) {
    throw new AIRequestError(`Gemini 接口返回 ${response.status}（Key 无效 / 模型名错误 / 额度用尽）`, response.status);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AIRequestError('Gemini 返回了空内容，请重试或更换模型');
  return String(text).trim();
}

async function callOpenAICompatible(settings: AISettings, request: ChatRequest): Promise<string> {
  const base = normalizeBaseUrl(settings.baseUrl);
  const url = `${base}/chat/completions`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        temperature: request.temperature ?? settings.temperature,
        max_tokens: request.maxTokens ?? 600,
        stream: false,
      }),
    },
    request.timeoutMs ?? 30000,
  );
  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      detail = text.slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new AIRequestError(
      `接口返回 ${response.status}${detail ? `：${detail}` : ''}（Key / 模型名 / 余额 / 跨域）`,
      response.status,
    );
  }
  const data = await response.json();
  const text =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    '';
  if (!text) throw new AIRequestError('模型返回了空内容，请重试或更换模型');
  return String(text).trim();
}

/** 统一的对话补全调用 */
export async function requestChatCompletion(settings: AISettings, request: ChatRequest): Promise<string> {
  const preset = getProviderPreset(settings.provider);
  try {
    if (preset.protocol === 'gemini') {
      return await callGemini(settings, request);
    }
    return await callOpenAICompatible(settings, request);
  } catch (error) {
    if (error instanceof AIRequestError) throw error;
    throw new AIRequestError(describeNetworkError(error));
  }
}

/** 逐行解析 SSE 流，兼容 OpenAI 与 Gemini 两种事件结构 */
async function readSSE(
  response: Response,
  onEvent: (payload: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRequestError('当前浏览器不支持流式响应');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        /* 忽略不完整分片 */
      }
    }
  }
}

export interface StreamHandlers {
  /** 每收到增量文本时回调（delta 为本段增量，full 为累计全文） */
  onDelta: (delta: string, full: string) => void;
}

/**
 * 流式对话补全：边生成边回调，桌面端体验接近原生 AI 产品。
 * 若供应商/网络不支持流式，调用方应回退到 requestChatCompletion。
 */
export async function streamChatCompletion(
  settings: AISettings,
  request: ChatRequest,
  handlers: StreamHandlers,
): Promise<string> {
  const preset = getProviderPreset(settings.provider);
  const base = normalizeBaseUrl(settings.baseUrl);
  const timeoutMs = request.timeoutMs ?? 90000;
  let full = '';

  const push = (delta: string) => {
    if (!delta) return;
    full += delta;
    handlers.onDelta(delta, full);
  };

  try {
    if (preset.protocol === 'gemini') {
      const url = `${base}/v1beta/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.apiKey)}`;
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${request.system}\n\n${request.user}` }] }],
            generationConfig: {
              temperature: request.temperature ?? settings.temperature,
              maxOutputTokens: request.maxTokens ?? 800,
            },
          }),
        },
        timeoutMs,
      );
      if (!response.ok) {
        throw new AIRequestError(`Gemini 接口返回 ${response.status}（Key 无效 / 模型名错误 / 额度用尽）`, response.status);
      }
      await readSSE(response, (payload) => {
        const parts = payload?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          push(parts.map((part: any) => part?.text || '').join(''));
        }
      });
    } else {
      const url = `${base}/chat/completions`;
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            temperature: request.temperature ?? settings.temperature,
            max_tokens: request.maxTokens ?? 800,
            stream: true,
          }),
        },
        timeoutMs,
      );
      if (!response.ok) {
        let detail = '';
        try {
          detail = (await response.text()).slice(0, 160);
        } catch {
          /* ignore */
        }
        throw new AIRequestError(`接口返回 ${response.status}${detail ? `：${detail}` : ''}`, response.status);
      }
      await readSSE(response, (payload) => {
        const delta = payload?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') push(delta);
        else if (typeof payload?.choices?.[0]?.text === 'string') push(payload.choices[0].text);
      });
    }

    if (!full.trim()) throw new AIRequestError('模型没有返回内容，请重试或更换模型');
    return full.trim();
  } catch (error) {
    if (error instanceof AIRequestError) throw error;
    throw new AIRequestError(describeNetworkError(error));
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** 设置面板里的"测试连接"：发一个极小请求验证 Key / 地址 / 模型可用 */
export async function testAIConnection(settings: AISettings): Promise<ConnectionTestResult> {
  if (!isAIConfigured(settings)) {
    return { ok: false, message: '请先填写 Base URL、模型名和 API Key' };
  }
  const startedAt = Date.now();
  try {
    const reply = await requestChatCompletion(settings, {
      system: '你是一个连通性测试助手。',
      user: '只回复两个字：可用',
      maxTokens: 12,
      temperature: 0,
      timeoutMs: 20000,
    });
    return {
      ok: true,
      message: `连接成功 · ${getProviderPreset(settings.provider).label} · ${settings.model}${reply ? '' : ''}`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}
