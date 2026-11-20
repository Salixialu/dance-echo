/**
 * 显示标题：用户设置的 title 优先，空值回退到磁盘文件名。
 * 只用于 UI 展示，不改 name / path / 磁盘文件。
 */
export function displayTitle(video: { title?: string; name: string }): string {
  const title = video.title?.trim();
  return title || video.name;
}

/** 去掉扩展名的文件名，用于卡片上更干净的默认标题。 */
export function displayFileName(video: { name: string }): string {
  return video.name.replace(/\.[^.]+$/, '');
}

/** 有自定义标题时，把真实文件名作为副信息返回；否则返回 null。 */
export function displayFileNameHint(video: { title?: string; name: string }): string | null {
  return video.title?.trim() ? video.name : null;
}
