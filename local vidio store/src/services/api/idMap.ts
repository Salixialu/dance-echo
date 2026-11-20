/**
 * idMap — 本地记录 id ⇄ 服务端视频 id 的运行时映射
 *
 * 本地 id 是 `文件名-大小-修改时间`（历史遗留），服务端 id 是 `sha1(relPath)`。
 * 两者在导入/加载时建立映射，供 observationService、practiceLog 等旧模块访问服务端。
 */
const localToServer = new Map<string, string>();

export function registerServerId(localId: string, serverId: string | undefined): void {
  if (!localId || !serverId) return;
  localToServer.set(localId, serverId);
}

export function getServerId(localId: string): string | undefined {
  return localToServer.get(localId);
}

/** 允许调用方传服务端 id 或本地 id，统一解析为服务端 id */
export function resolveServerId(idOrServerId: string): string | undefined {
  return localToServer.get(idOrServerId) ?? (idOrServerId.length === 16 ? idOrServerId : undefined);
}
