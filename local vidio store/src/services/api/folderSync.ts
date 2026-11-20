/**
 * folderSync — 本地"虚拟文件夹路径" ⇄ 服务端扁平文件夹
 *
 * 本地模型是路径字符串（`A/B`），服务端模型是扁平 `{id, name}`。
 * 这里用「name = 完整路径」做一一映射，既能保留层级语义，也不需要服务端改模型。
 */
import { api } from './client';

const pathToId = new Map<string, string>();
const idToPath = new Map<string, string>();

export function serverFolderIdFor(path: string): string | undefined {
  return pathToId.get(path);
}

export function serverFolderPathFor(id: string): string | undefined {
  return idToPath.get(id);
}

function remember(path: string, id: string): void {
  pathToId.set(path, id);
  idToPath.set(id, path);
}

/** 启动时把服务端已有文件夹载入映射（name 即路径） */
export async function hydrateFolderMap(): Promise<void> {
  try {
    const { folders } = await api.folders();
    for (const folder of folders) {
      // 服务端 name 可能被截断到 120 字符，按原样建立映射
      remember(folder.name, folder.id);
    }
  } catch (error) {
    console.warn('[DanceEcho] 文件夹映射载入失败（离线或服务未启动）:', error);
  }
}

/** 确保某个路径在服务端存在，返回其服务端 id */
export async function ensureServerFolder(path: string): Promise<string | undefined> {
  const clean = (path || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  if (!clean) return undefined;
  const cached = pathToId.get(clean);
  if (cached) return cached;
  try {
    const { folder } = await api.createFolder(clean);
    remember(clean, folder.id);
    return folder.id;
  } catch (error) {
    console.warn('[DanceEcho] 创建服务端文件夹失败:', clean, error);
    return undefined;
  }
}

/** 把视频分配到某个路径（空路径 = 移出文件夹） */
export async function assignServerFolder(
  serverVideoId: string | undefined,
  path: string,
): Promise<void> {
  if (!serverVideoId) return;
  const clean = (path || '').trim();
  try {
    if (!clean) {
      await api.assignFolder(serverVideoId, null);
      return;
    }
    const folderId = await ensureServerFolder(clean);
    if (folderId) await api.assignFolder(serverVideoId, folderId);
  } catch (error) {
    console.warn('[DanceEcho] 同步文件夹归属失败:', serverVideoId, error);
  }
}

/** 重命名：服务端扁平模型下等于「新建新路径 + 删除旧路径」 */
export async function renameServerFolder(oldPath: string, newPath: string): Promise<void> {
  const oldId = pathToId.get(oldPath);
  if (!oldId) {
    await ensureServerFolder(newPath);
    return;
  }
  try {
    const { folder } = await api.createFolder(newPath);
    remember(newPath, folder.id);
    pathToId.delete(oldPath);
    idToPath.delete(oldId);
    await api.deleteFolder(oldId);
  } catch (error) {
    console.warn('[DanceEcho] 重命名服务端文件夹失败:', oldPath, '→', newPath, error);
  }
}

/** 删除：先移除所有以该路径为前缀的映射，再删服务端记录 */
export async function deleteServerFolder(path: string): Promise<void> {
  const prefixes = [`${path}`, `${path}/`];
  const targets = [...pathToId.entries()].filter(([p]) => prefixes.some((prefix) => p === prefix || p.startsWith(prefix)));
  for (const [p, id] of targets) {
    pathToId.delete(p);
    idToPath.delete(id);
    try {
      await api.deleteFolder(id);
    } catch (error) {
      console.warn('[DanceEcho] 删除服务端文件夹失败:', p, error);
    }
  }
}
