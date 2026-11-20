/**
 * mp4meta.mjs — 纯 JS、零依赖的 MP4 头部解析
 *
 * 只读取文件前 4MB，按 ISO Base Media File Format 的 box 结构扫描：
 *   ftyp → moov → mvhd（时长 / creation_time）
 *              → trak → tkhd（宽高）
 *
 * 任何解析失败都返回 null，绝不抛出，避免中断整次扫描。
 */
import { promises as fs } from 'node:fs';

const MP4_EPOCH_OFFSET = 2082844800; // 1904-01-01 到 1970-01-01 的秒数
const MAX_HEAD_BYTES = 4 * 1024 * 1024;

/** 读取 64 位大端无符号整数（精确到 2^53） */
function readUInt64(buf, off) {
  const hi = buf.readUInt32BE(off);
  const lo = buf.readUInt32BE(off + 4);
  return hi * 4294967296 + lo;
}

/**
 * 在 [start, end) 范围内线性查找指定类型的 box。
 * 返回 { payloadStart, payloadEnd }；找不到返回 null。
 */
function findBox(buf, start, end, type) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const boxType = buf.toString('latin1', off + 4, off + 8);
    let headerSize = 8;

    if (size === 1) {
      if (off + 16 > end) break;
      const large = readUInt64(buf, off + 8);
      if (large > Number.MAX_SAFE_INTEGER) break;
      size = large;
      headerSize = 16;
    } else if (size === 0) {
      // box 一直延伸到父容器末尾
      size = end - off;
    }

    if (size < headerSize || off + size > end) break;

    if (boxType === type) {
      return { payloadStart: off + headerSize, payloadEnd: off + size };
    }
    off += size;
  }
  return null;
}

/** 遍历 [start, end) 下所有指定类型的直接子 box，返回 payload 范围数组 */
function listBoxes(buf, start, end, type) {
  const found = [];
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const boxType = buf.toString('latin1', off + 4, off + 8);
    let headerSize = 8;
    if (size === 1) {
      if (off + 16 > end) break;
      size = readUInt64(buf, off + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < headerSize || off + size > end) break;
    if (boxType === type) {
      found.push({ payloadStart: off + headerSize, payloadEnd: off + size });
    }
    off += size;
  }
  return found;
}

/** 解析 mvhd：creation_time、timescale、duration（秒） */
function parseMvhd(buf, start, end) {
  if (end - start < 20) return null;
  const version = buf[start];
  let creationTime = 0;
  let timescale = 0;
  let duration = 0;

  if (version === 1) {
    if (end - start < 32) return null;
    creationTime = readUInt64(buf, start + 4);
    timescale = buf.readUInt32BE(start + 20);
    duration = readUInt64(buf, start + 24);
    if (duration >= Number.MAX_SAFE_INTEGER) duration = 0;
  } else {
    creationTime = buf.readUInt32BE(start + 4);
    timescale = buf.readUInt32BE(start + 12);
    duration = buf.readUInt32BE(start + 16);
    if (duration === 0xffffffff) duration = 0;
  }

  let seconds = null;
  if (timescale > 0 && duration > 0) {
    seconds = Math.round((duration / timescale) * 1000) / 1000;
  }

  let iso = null;
  // 0 表示未写入；1980 年之前的值基本都是垃圾数据
  if (creationTime > 0) {
    const unixSeconds = creationTime - MP4_EPOCH_OFFSET;
    if (unixSeconds > 0 && unixSeconds < 4102444800) {
      const d = new Date(unixSeconds * 1000);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString();
    }
  }

  return { creationTime: iso, duration: seconds };
}

/** 解析 tkhd 末尾的 width / height（16.16 定点数） */
function parseTkhd(buf, start, end) {
  if (end - start < 8) return null;
  const width = buf.readUInt32BE(end - 8) >>> 16;
  const height = buf.readUInt32BE(end - 4) >>> 16;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * 读取 MP4 元数据。
 * @param {string} filePath
 * @returns {Promise<null | {creationTime: string|null, duration: number|null, width: number|null, height: number|null}>}
 */
export async function readMp4Meta(filePath) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 16) return null;

    const readSize = Math.min(stat.size, MAX_HEAD_BYTES);
    const buf = Buffer.allocUnsafe(readSize);
    const { bytesRead } = await handle.read(buf, 0, readSize, 0);
    if (bytesRead < 16) return null;
    const head = buf.subarray(0, bytesRead);

    const moov = findBox(head, 0, head.length, 'moov');
    if (!moov) return null; // moov 在 4MB 之后（未 faststart），放弃

    const mvhdBox = findBox(head, moov.payloadStart, moov.payloadEnd, 'mvhd');
    const mvhd = mvhdBox ? parseMvhd(head, mvhdBox.payloadStart, mvhdBox.payloadEnd) : null;

    let best = null;
    for (const trak of listBoxes(head, moov.payloadStart, moov.payloadEnd, 'trak')) {
      const tkhdBox = findBox(head, trak.payloadStart, trak.payloadEnd, 'tkhd');
      if (!tkhdBox) continue;
      const dims = parseTkhd(head, tkhdBox.payloadStart, tkhdBox.payloadEnd);
      if (!dims) continue;
      if (!best || dims.width * dims.height > best.width * best.height) best = dims;
    }

    return {
      creationTime: mvhd?.creationTime ?? null,
      duration: mvhd?.duration ?? null,
      width: best?.width ?? null,
      height: best?.height ?? null,
    };
  } catch {
    return null;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* ignore */
      }
    }
  }
}
