/**
 * songService.ts — 舞蹈歌曲识别与元数据档案服务
 * 
 * 核心设计遵循国内网络环境与无门槛使用：
 * 1. 100% 免费国内直连：内置海量舞曲词库 + 智能文件名解析 + 开放搜索
 * 2. 预备好国内专业音频指纹：ACRCloud (中国北京/上海节点，每月 10000 次免费)
 * 3. 预备好大模型听音：Gemini 2.5 Flash 多模态听音识别
 * 4. 离线/未配置时平滑降级：支持快捷手动输入与曲库秒选
 */

export interface SongMetadata {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  genre?: string;
  bpm?: number;
  /** 识曲置信度 0~1（ACRCloud 返回的 score）；为空表示来源不提供 */
  confidence?: number;
  source: 'preset' | 'file-guess' | 'search' | 'acrcloud' | 'gemini' | 'manual';
}

export interface ACRCloudSettings {
  host: string;
  accessKey: string;
  accessSecret: string;
}

/** 试听片段（来自 Apple Music 搜索接口的 30 秒官方 preview） */
export interface SongPreview {
  trackName: string;
  artistName: string;
  previewUrl: string;
  artworkUrl?: string;
  trackViewUrl?: string;
}

/// 内置热门舞蹈教学/翻跳高频编舞曲目库 (离线秒级匹配)
export const POPULAR_DANCE_CATALOG: Array<{
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  coverUrl: string;
  keywords: string[];
}> = [
  // NewJeans
  {
    title: 'Super Shy',
    artist: 'NewJeans (뉴진스)',
    genre: 'K-Pop / Jersey Club',
    bpm: 150,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
    keywords: ['super shy', 'supershy', 'newjeans', '뉴진스'],
  },
  {
    title: 'OMG',
    artist: 'NewJeans (뉴진스)',
    genre: 'K-Pop / R&B Trap',
    bpm: 127,
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
    keywords: ['omg', 'newjeans', 'oh my god'],
  },
  {
    title: 'Hype Boy',
    artist: 'NewJeans (뉴진스)',
    genre: 'K-Pop / Pop',
    bpm: 100,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
    keywords: ['hype boy', 'hypeboy', 'newjeans'],
  },
  {
    title: 'Ditto',
    artist: 'NewJeans (뉴진스)',
    genre: 'K-Pop / Baltimore Club',
    bpm: 134,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
    keywords: ['ditto', 'newjeans'],
  },
  {
    title: 'ETA',
    artist: 'NewJeans (뉴진스)',
    genre: 'K-Pop / Breakbeat',
    bpm: 132,
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
    keywords: ['eta', 'newjeans'],
  },
  // aespa
  {
    title: 'Supernova',
    artist: 'aespa (에스파)',
    genre: 'K-Pop / Hyperpop Dance',
    bpm: 124,
    coverUrl: 'https://images.unsplash.com/photo-1445985543468-7908d9e12d0e?w=300&q=80',
    keywords: ['supernova', 'aespa', '에스파'],
  },
  {
    title: 'Whiplash',
    artist: 'aespa (에스파)',
    genre: 'K-Pop / EDM Techno',
    bpm: 130,
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80',
    keywords: ['whiplash', 'aespa'],
  },
  {
    title: 'Armageddon',
    artist: 'aespa (에스파)',
    genre: 'K-Pop / Hip-Hop Dance',
    bpm: 90,
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80',
    keywords: ['armageddon', 'aespa'],
  },
  {
    title: 'Drama',
    artist: 'aespa (에스파)',
    genre: 'K-Pop / Hip-Hop',
    bpm: 115,
    coverUrl: 'https://images.unsplash.com/photo-1445985543468-7908d9e12d0e?w=300&q=80',
    keywords: ['drama', 'aespa'],
  },
  // LE SSERAFIM
  {
    title: 'Antifragile',
    artist: 'LE SSERAFIM (르세라핌)',
    genre: 'K-Pop / Afro-Latin Pop',
    bpm: 105,
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
    keywords: ['antifragile', 'le sserafim', 'lesserafim', '르세라핌'],
  },
  {
    title: 'Smart',
    artist: 'LE SSERAFIM (르세라핌)',
    genre: 'K-Pop / Amapiano',
    bpm: 113,
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80',
    keywords: ['smart', 'le sserafim', 'lesserafim'],
  },
  {
    title: 'EASY',
    artist: 'LE SSERAFIM (르세라핌)',
    genre: 'K-Pop / Old-school Hip-Hop',
    bpm: 83,
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
    keywords: ['easy', 'le sserafim', 'lesserafim'],
  },
  {
    title: 'Perfect Night',
    artist: 'LE SSERAFIM (르세라핌)',
    genre: 'K-Pop / 2-Step Garage',
    bpm: 118,
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80',
    keywords: ['perfect night', 'le sserafim'],
  },
  // ILLIT
  {
    title: 'Magnetic',
    artist: 'ILLIT (아일릿)',
    genre: 'K-Pop / Pluggnb House',
    bpm: 131,
    coverUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80',
    keywords: ['magnetic', 'illit', '아일릿'],
  },
  // BLACKPINK
  {
    title: 'Pink Venom',
    artist: 'BLACKPINK',
    genre: 'K-Pop / Hip-Hop',
    bpm: 90,
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80',
    keywords: ['pink venom', 'pinkvenom', 'blackpink'],
  },
  {
    title: 'Shut Down',
    artist: 'BLACKPINK',
    genre: 'K-Pop / Classical Hip-Hop',
    bpm: 110,
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80',
    keywords: ['shut down', 'shutdown', 'blackpink'],
  },
  // (G)I-DLE
  {
    title: 'Queencard',
    artist: '(G)I-DLE ((여자)아이들)',
    genre: 'K-Pop / Pop Rock',
    bpm: 130,
    coverUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80',
    keywords: ['queencard', 'gidle', 'g-i-dle', '아이들'],
  },
  {
    title: 'TOMBOY',
    artist: '(G)I-DLE ((여자)아이들)',
    genre: 'K-Pop / Pop Punk',
    bpm: 120,
    coverUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80',
    keywords: ['tomboy', 'gidle', 'g-i-dle'],
  },
  // IVE
  {
    title: 'LOVE DIVE',
    artist: 'IVE (아이브)',
    genre: 'K-Pop / Dark Pop',
    bpm: 118,
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
    keywords: ['love dive', 'lovedive', 'ive', '아이브'],
  },
  {
    title: 'I AM',
    artist: 'IVE (아이브)',
    genre: 'K-Pop / Nu-Disco Pop',
    bpm: 126,
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
    keywords: ['i am', 'ive'],
  },
  // BTS & Solo
  {
    title: 'Dynamite',
    artist: 'BTS (방탄소년단)',
    genre: 'Disco Pop',
    bpm: 114,
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&q=80',
    keywords: ['dynamite', 'bts', '방탄소년단'],
  },
  {
    title: 'Seven',
    artist: 'Jung Kook (ft. Latto)',
    genre: 'UK Garage / Pop',
    bpm: 125,
    coverUrl: 'https://images.unsplash.com/photo-1520523839898-50712825e3a7?w=300&q=80',
    keywords: ['seven', 'jungkook', 'jung kook'],
  },
  // Urban / Funk / Hip-Hop
  {
    title: 'Uptown Funk',
    artist: 'Mark Ronson ft. Bruno Mars',
    genre: 'Funk / Pop',
    bpm: 115,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
    keywords: ['uptown funk', 'bruno mars'],
  },
  // 华语热门舞曲
  {
    title: '本草纲目',
    artist: '周杰伦',
    genre: 'C-Pop / 中国风 Hip-Hop',
    bpm: 105,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
    keywords: ['本草纲目', '周杰伦', 'jay chou'],
  },
  {
    title: '舞娘',
    artist: '蔡依林',
    genre: 'C-Pop / Dance Pop',
    bpm: 128,
    coverUrl: 'https://images.unsplash.com/photo-1445985543468-7908d9e12d0e?w=300&q=80',
    keywords: ['舞娘', '蔡依林', 'jolin tsai'],
  },
  {
    title: '怪美的',
    artist: '蔡依林',
    genre: 'C-Pop / Trap Pop',
    bpm: 125,
    coverUrl: 'https://images.unsplash.com/photo-1445985543468-7908d9e12d0e?w=300&q=80',
    keywords: ['怪美的', '蔡依林'],
  },
  {
    title: '爱人错过',
    artist: '告五人',
    genre: 'Indie Rock / 齐舞编舞',
    bpm: 118,
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80',
    keywords: ['爱人错过', '告五人'],
  },
];

export class SongService {
  private static instance: SongService | null = null;

  static getInstance(): SongService {
    if (!this.instance) {
      this.instance = new SongService();
    }
    return this.instance;
  }

  /**
   * 从视频文件名中清洗出干净的舞曲检索关键词
   * 例如: "[Dance Practice] NewJeans 'Super Shy' 4K.mp4" => "NewJeans Super Shy"
   */
  cleanFileNameForSearch(filename: string): string {
    let clean = filename
      .replace(/\.(mp4|mov|mkv|webm|avi|flv|m4v|ts|wmv)$/i, '')
      .replace(/BV[0-9a-zA-Z]{10}/g, ' ')
      .replace(/\b(19|20)\d{2}[-._/\s]?(0[1-9]|1[0-2])[-._/\s]?(0[1-9]|[12]\d|3[01])\b/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^\)]*\)/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(/（[^）]*）/g, ' ')
      .replace(/《[^》]*》/g, ' ')
      .replace(
        /(dance practice|choreography|choreography video|mirrored|mirror|1080p|720p|4k|60fps|2160p|official|mv|m\/v|stage|fancam|live|练习室|镜面|教学|翻跳|正反面|原版|高清|纯享|纯舞|完整版|齐舞|慢动作|机位|慢放)/gi,
        ' '
      )
      .replace(/['"_\-+—#@]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 手机/相册导出的文件名没有检索价值，别拿它去白跑一次文本搜索：
    // mmexport1698…、IMG_1234、VID_20240101、PXL_…、DSC_…、纯数字 1.mp4 …
    if (!/[A-Za-z\u4e00-\u9fa5]/.test(clean)) return '';
    const compact = clean.replace(/\s+/g, '');
    if (/^(mmexport|img|vid|mvimg|pxl|dsc|gopr|dji|screenrecord|录屏|屏幕录制)/i.test(compact)) {
      // 只有「前缀 + 数字/时间戳」才算无意义；带真实歌名的（如 IMG_… Super Shy）不受影响
      if (!/[A-Za-z\u4e00-\u9fa5]{3,}/.test(compact.replace(/^(mmexport|img|vid|mvimg|pxl|dsc|gopr|dji|screenrecord|录屏|屏幕录制)/i, ''))) {
        return '';
      }
    }
    return clean;
  }

  /**
   * 基于关键词从内置曲库或国内开放曲库检索匹配舞曲
   */
  async searchSong(query: string): Promise<SongMetadata[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // 1. 尝试国内直连的代理搜索 (网易云音乐公有 CloudSearch 接口)
    try {
      const proxySearchUrl = `/api/music/search?s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=8`;
      const res = await fetch(proxySearchUrl, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        const songs = json?.result?.songs || [];
        if (Array.isArray(songs) && songs.length > 0) {
          const apiResults: SongMetadata[] = songs.map((s: any) => ({
            title: s.name || query,
            artist: (s.ar || s.artists || []).map((a: any) => a.name).join(' / ') || '未知艺术家',
            album: s.al?.name || s.album?.name || '',
            coverUrl: s.al?.picUrl || s.album?.picUrl || '',
            duration: s.dt ? Math.round(s.dt / 1000) : undefined,
            source: 'search' as const,
          }));

          // 如果在内置高频库中有对应的推荐 BPM，自动补全 BPM
          for (const item of apiResults) {
            const preset = POPULAR_DANCE_CATALOG.find(
              (p) =>
                p.title.toLowerCase() === item.title.toLowerCase() ||
                item.title.toLowerCase().includes(p.title.toLowerCase())
            );
            if (preset?.bpm) {
              item.bpm = preset.bpm;
              if (!item.genre) item.genre = preset.genre;
            }
          }

          return apiResults;
        }
      }
    } catch {
      // 网络限制或非 dev/serve 环境时平滑降级
    }

    // 2. 降级匹配内置热门编舞高频曲目库
    const localMatches = POPULAR_DANCE_CATALOG.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(q) || q.includes(item.title.toLowerCase());
      const artistMatch = item.artist.toLowerCase().includes(q) || q.includes(item.artist.toLowerCase());
      const kwMatch = item.keywords.some((k) => q.includes(k) || k.includes(q));
      return titleMatch || artistMatch || kwMatch;
    }).map((item) => ({
      title: item.title,
      artist: item.artist,
      genre: item.genre,
      bpm: item.bpm,
      coverUrl: item.coverUrl,
      source: 'preset' as const,
    }));

    if (localMatches.length > 0) {
      return localMatches;
    }

    // 3. 没有可信匹配时返回空数组：不要用输入词伪造曲目，
    //    否则“导入时按文件名识别歌曲”会把文件名当成歌名写进标签。
    return [];
  }

  /**
   * 自动从视频名称进行舞曲推测
   * 加入相似度门槛：避免把"课堂录像""练习正面"这类通用文件名误判成某首歌，
   * 从而在标签体系里塞进一堆噪声标签。
   */
  async guessFromVideoName(filename: string): Promise<SongMetadata | null> {
    const cleaned = this.cleanFileNameForSearch(filename);
    if (!cleaned || cleaned.length < 2) return null;

    const matches = await this.searchSong(cleaned);
    if (matches.length === 0) return null;

    const top = matches[0];
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[\s\-_()（）\[\]【】·.,，。!！?？'"“”‘’:：/\\|]/g, '');
    const source = normalize(cleaned);
    const target = normalize(top.title || '');
    if (!source || !target) return null;

    const sourceChars = new Set(source);
    const targetChars = new Set(target);
    let hit = 0;
    sourceChars.forEach((char) => {
      if (targetChars.has(char)) hit += 1;
    });
    const ratio = hit / Math.max(1, Math.min(sourceChars.size, targetChars.size));
    // 直接包含也要有足够长度：避免"课堂"这种 2 字短标题把整段文件名都算成命中
    const shorterSide = Math.min(source.length, target.length);
    const directHit = (source.includes(target) || target.includes(source)) && shorterSide >= 4;

    return directHit || ratio >= 0.72 ? top : null;
  }

  /** 默认国内节点；控制台里复制到的是裸域名 */
  static readonly DEFAULT_ACR_HOST = 'identify-cn-north-1.acrcloud.cn';

  /**
   * 容错 Host：用户经常把「https://」前缀、末尾斜杠或整个控制台地址粘进来。
   * 不归一化的话 fetch 会拼成 https://https://xxx/v1/identify，浏览器直接抛
   * TypeError: Failed to fetch —— 看起来就像「连接出问题」。
   */
  private normalizeHost(raw: string): string {
    return String(raw || '')
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/\s+/g, '');
  }

  /**
   * 获取保存在本地的 ACRCloud 国内节点设置
   */
  getACRCloudConfig(): { isConfigured: boolean; config: ACRCloudSettings } {
    const storedHost = localStorage.getItem('dance_echo_acr_host') || '';
    const host = this.normalizeHost(storedHost) || SongService.DEFAULT_ACR_HOST;
    const accessKey = localStorage.getItem('dance_echo_acr_key') || '';
    const accessSecret = localStorage.getItem('dance_echo_acr_secret') || '';

    const isConfigured = Boolean(accessKey.trim() && accessSecret.trim());
    return {
      isConfigured,
      config: { host, accessKey, accessSecret },
    };
  }

  /**
   * 保存 ACRCloud 凭据
   */
  saveACRCloudConfig(settings: Partial<ACRCloudSettings>): void {
    if (settings.host !== undefined) {
      const host = this.normalizeHost(settings.host);
      if (host) localStorage.setItem('dance_echo_acr_host', host);
    }
    if (settings.accessKey !== undefined) localStorage.setItem('dance_echo_acr_key', settings.accessKey.trim());
    if (settings.accessSecret !== undefined) localStorage.setItem('dance_echo_acr_secret', settings.accessSecret.trim());
  }

  /**
   * 使用浏览器原生 Web Crypto 计算 HMAC-SHA1 签名
   */
  private async hmacSha1(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  /**
   * 把任意解码后的音频转成 16kHz 单声道 16bit PCM WAV（ACRCloud 最稳妥的输入格式）
   * 返回 WAV Blob 与片段 RMS（用于判断是不是静音片段）
   */
  private async encodeWavSnippet(
    buffer: AudioBuffer,
    startSec: number,
    durationSec: number
  ): Promise<{ blob: Blob; rms: number; duration: number }> {
    const sampleRate = 16000;
    const start = Math.max(0, Math.min(startSec, Math.max(0, buffer.duration - 0.5)));
    const duration = Math.min(durationSec, Math.max(0.5, buffer.duration - start));
    const frames = Math.max(1, Math.floor(duration * sampleRate));

    const offline = new OfflineAudioContext(1, frames, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0, start, duration);
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);

    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, samples.length));

    // 16bit PCM WAV 封装
    const bytesPerSample = 2;
    const dataSize = samples.length * bytesPerSample;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeString = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // 单声道
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    return {
      blob: new Blob([header, pcm.buffer], { type: 'audio/wav' }),
      rms,
      duration,
    };
  }

  /**
   * ACRCloud 底层请求：返回原始 status.code / msg，便于区分"密钥错"与"没匹配到"
   */
  private async requestACRCloud(audioBlob: Blob): Promise<{
    code: number;
    message: string;
    metadata?: SongMetadata;
  }> {
    const { isConfigured, config } = this.getACRCloudConfig();
    if (!isConfigured) {
      return { code: -1, message: '未配置 ACRCloud 密钥 (设置 → 歌曲识别)' };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `POST\n/v1/identify\n${config.accessKey}\naudio\n1\n${timestamp}`;
    const signature = await this.hmacSha1(config.accessSecret, stringToSign);

    const formData = new FormData();
    formData.append('sample', audioBlob);
    formData.append('sample_bytes', audioBlob.size.toString());
    formData.append('access_key', config.accessKey);
    formData.append('data_type', 'audio');
    formData.append('signature_version', '1');
    formData.append('signature', signature);
    formData.append('timestamp', timestamp);

    const url = `https://${config.host}/v1/identify`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError / TypeError 都归到「连接」层：给出 Host 和排查方向，
      // 而不是把裸的 "Failed to fetch" 丢给用户。
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`连接 ${config.host} 超时（20 秒）。请检查网络/代理，或确认 Host 填写正确。`);
      }
      throw new Error(
        `无法连接 ${config.host}：${err instanceof Error ? err.message : String(err)}。请检查网络/代理，或确认 Host 填写正确（不带 https:// 和路径）。`
      );
    } finally {
      clearTimeout(timer);
    }

    const rawText = await response.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(rawText);
    } catch {
      resJson = null;
    }

    if (!response.ok) {
      return {
        code: -2,
        message: `ACRCloud 请求失败: HTTP ${response.status} ${rawText.slice(0, 120)}`,
      };
    }
    if (!resJson?.status) {
      return { code: -3, message: `ACRCloud 返回异常: ${rawText.slice(0, 120)}` };
    }

    const code = Number(resJson.status.code);
    const msg = String(resJson.status.msg || '');
    const music = resJson.metadata?.music?.[0];

    if (code === 0 && music) {
      return {
        code: 0,
        message: msg || 'ok',
        metadata: {
          title: music.title || '未知曲目',
          artist: (music.artists || []).map((a: any) => a.name).join(' / ') || '未知艺术家',
          album: music.album?.name || '',
          genre: (music.genres || []).map((g: any) => g.name).join(' / ') || 'Dance',
          bpm: music.bpm || undefined,
          confidence: typeof music.score === 'number' ? music.score : undefined,
          source: 'acrcloud',
        },
      };
    }

    return { code, message: msg };
  }

  /**
   * 把 ACRCloud 的状态码翻译成用户能自己排查的话
   */
  private describeACRError(code: number, message: string): string {
    const suffix = message ? `（${message}）` : '';
    switch (code) {
      case 1001:
        return `认证通过，但曲库没有匹配到这段音频${suffix}。常见原因：抽取的片段是静音/人声口令、曲子不在 ACRCloud 曲库、或片段太短。`;
      case 3001:
        return `Access Key 无效或未填写完整${suffix}。请到 ACRCloud 控制台的 Project 页面重新复制 Access Key / Secret。`;
      case 3014:
        return `签名校验失败${suffix}。多半是 Access Secret 填错，或本机时间偏差过大（请校准系统时间后重试）。`;
      case 2004:
        return `音频太短，无法识别${suffix}。请把视频播放到有音乐的位置再重试。`;
      case 2005:
        return `音频质量过低或无有效音频${suffix}。`;
      default:
        return `ACRCloud 返回错误码 ${code}${suffix}`;
    }
  }

  /**
   * ACRCloud 听歌识曲识别 (国内北京/上海节点)
   */
  async recognizeWithACRCloud(audioBlob: Blob): Promise<{ success: boolean; metadata?: SongMetadata; message: string }> {
    try {
      const result = await this.requestACRCloud(audioBlob);
      if (result.code === 0 && result.metadata) {
        return {
          success: true,
          metadata: result.metadata,
          message: `🎉 ACRCloud 识别成功：《${result.metadata.title}》- ${result.metadata.artist}`,
        };
      }
      return { success: false, message: this.describeACRError(result.code, result.message) };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '识别请求失败（网络不通或被浏览器拦截）',
      };
    }
  }

  /**
   * 设置页的"测试连通"：发一段静音 WAV。
   * 只要返回 1001（认证通过但无匹配）就说明 Host / Key / Secret 全部正确；
   * 返回 3001 / 3014 则明确指向密钥或签名问题。
   */
  async testACRCloudConnection(): Promise<{ ok: boolean; message: string }> {
    const { isConfigured } = this.getACRCloudConfig();
    if (!isConfigured) {
      return { ok: false, message: '请先填写 Access Key 与 Access Secret' };
    }

    try {
      // 2 秒静音（16kHz 单声道 16bit）
      const sampleRate = 16000;
      const frames = sampleRate * 2;
      const buffer = new ArrayBuffer(44 + frames * 2);
      const view = new DataView(buffer);
      const writeString = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
      };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + frames * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, frames * 2, true);

      const result = await this.requestACRCloud(new Blob([buffer], { type: 'audio/wav' }));
      // ACRCloud 先校验 access_key / 签名，再处理音频（实测：错误 secret + 静音样本
      // 返回 3014，而不是 2004）。所以 1001/2004/2005 都说明「认证已通过」，
      // 只是这段 2 秒静音没法生成指纹——不能把它当成连接失败报红。
      if (result.code === 1001) {
        return { ok: true, message: '✅ 连通正常：Host / Key / Secret 全部有效（静音样本返回 1001 = 无匹配，属于预期）' };
      }
      if (result.code === 2004 || result.code === 2005) {
        return {
          ok: true,
          message: `✅ 连通正常：Host / Key / Secret 校验通过（静音样本无法生成指纹，返回 ${result.code}，不影响真实视频识别）`,
        };
      }
      if (result.code === 0) {
        return { ok: true, message: '✅ 连通正常（意外匹配到结果，但密钥有效）' };
      }
      return { ok: false, message: this.describeACRError(result.code, result.message) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : '网络请求失败，请检查 Host 或网络代理',
      };
    }
  }

  /**
   * 按曲名/歌手去 Apple Music 搜索 30 秒官方试听片段。
   * iTunes Search API 返回 Access-Control-Allow-Origin: *，浏览器可直连；
   * <audio> 播放跨域媒体也不需要 CORS 头，因此纯前端即可独立试听。
   */
  async fetchSongPreview(title: string, artist: string): Promise<SongPreview | null> {
    const term = [title, artist].filter((part) => part && part.trim()).join(' ').trim();
    if (!term) return null;

    const buildUrl = (country?: string) =>
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=8${
        country ? `&country=${country}` : ''
      }`;

    const normalize = (value: string) =>
      (value || '').toLowerCase().replace(/[\s\-_()（）\[\]【】·.,，。!！?？'"“”‘’]/g, '');
    const wanted = normalize(title);

    const request = async (url: string): Promise<any[]> => {
      const response = await fetch(url);
      if (!response.ok) return [];
      const json = await response.json();
      return Array.isArray(json?.results) ? json.results : [];
    };

    let results: any[] = [];
    try {
      results = await request(buildUrl('cn'));
      if (!results.length) results = await request(buildUrl());
      if (!results.length) results = await request(buildUrl('us'));
    } catch {
      return null;
    }

    const usable = results.filter((item) => item?.previewUrl);
    if (!usable.length) return null;

    // 优先同名曲目，其次是第一条带试听的
    const exact = usable.find((item) => normalize(item.trackName || '').includes(wanted) && wanted.length >= 2);
    const picked = exact || usable[0];

    return {
      trackName: picked.trackName || title,
      artistName: picked.artistName || artist,
      previewUrl: picked.previewUrl,
      artworkUrl: picked.artworkUrl100 || picked.artworkUrl60,
      trackViewUrl: picked.trackViewUrl,
    };
  }

  /**
   * 从 HTMLVideoElement 抽取音频片段并转成 16k 单声道 WAV。
   * 优先走 WebAudio 解码（不依赖播放状态、不依赖是否静音），失败才回退 captureStream。
   */
  async extractAudioSnippet(
    videoElement: HTMLVideoElement,
    durationSec: number = 6
  ): Promise<Blob> {
    const src = videoElement.currentSrc || videoElement.src;
    const startAt = Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;

    if (src) {
      try {
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        let decoded: AudioBuffer;
        try {
          decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        } finally {
          void ctx.close();
        }

        const { blob, rms } = await this.encodeWavSnippet(decoded, startAt, durationSec);
        if (rms < 0.002) {
          throw new Error(
            '截取到的这段是静音，识别再多次也不会有结果。请先把视频拖到有明显音乐的位置，再点识别。'
          );
        }
        return blob;
      } catch (err) {
        // 静音判定要直接抛给用户，不进入 captureStream 回退
        if (err instanceof Error && err.message.includes('静音')) throw err;
      }
    }

    // 回退：captureStream（需要视频正在播放且未静音）
    return new Promise((resolve, reject) => {
      try {
        const capture = (videoElement as any).captureStream || (videoElement as any).mozCaptureStream;
        if (!capture) throw new Error('当前浏览器不支持音频抽取，请换用最新版 Chrome / Edge');
        if (videoElement.paused) {
          throw new Error('视频未播放：请先点击播放，再在音乐响起的片段执行识别');
        }
        const stream = capture.call(videoElement) as MediaStream;
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) throw new Error('这个视频没有音轨，无法做听音识曲');

        const recorder = new MediaRecorder(new MediaStream(audioTracks), {
          mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
        recorder.onerror = (e) => reject(e);
        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, durationSec * 1000);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 导入时的听歌识曲入口：直接解码一个视频文件（没有 <video> 元素可用）。
   * 默认取时长的 35% 处 6 秒——练习室视频开头多是口令/准备动作，中段才在放歌。
   */
  async extractAudioSnippetFromBlob(
    source: Blob,
    options: { startFraction?: number; durationSec?: number } = {}
  ): Promise<Blob> {
    const { startFraction = 0.35, durationSec = 6 } = options;
    const arrayBuffer = await source.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      throw new Error('这个视频的音轨无法解码（可能是 HEVC 容器里的 AAC，浏览器解不了音频）');
    } finally {
      void ctx.close();
    }

    const total = decoded.duration;
    if (!Number.isFinite(total) || total < 1) {
      throw new Error('视频太短，抽不出可识别的音频');
    }
    const span = Math.min(durationSec, Math.max(1, total - 1));
    const startAt = Math.max(0, Math.min(total * startFraction, total - span));

    const { blob, rms } = await this.encodeWavSnippet(decoded, startAt, span);
    if (rms < 0.002) {
      throw new Error('这段音频基本上是静音，换一段也识别不出曲目');
    }
    return blob;
  }
}

export const songService = SongService.getInstance();
