import type { VideoItem } from '../types';

/**
 * 纯本地浏览器生成带时间戳、舞步节拍动画的演示视频 Blob
 * 保证无需任何外网下载即可体验完整的播放、镜像、AB循环与留言功能
 */
export async function createDemoDanceVideo(
  title: string,
  durationSec: number = 8,
  accentColor: string = '#d946ef'
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30); // 30 FPS
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const file = new File([blob], `${title}.webm`, { type: 'video/webm' });
      resolve(file);
    };

    recorder.start();
    const startTime = performance.now();
    const totalFrames = durationSec * 30;
    let currentFrame = 0;

    const interval = setInterval(() => {
      currentFrame++;
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = currentFrame / totalFrames;

      // 绘制背景
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制律动光环 (模拟舞蹈节拍)
      const beat = (Math.sin(elapsed * 5) + 1) / 2;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4 + beat * 6;
      ctx.beginPath();
      ctx.arc(320, 180, 50 + beat * 30, 0, Math.PI * 2);
      ctx.stroke();

      // 舞蹈人形示意 (简笔火柴人动作示意律动)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(320, 120 + Math.sin(elapsed * 4) * 8, 14, 0, Math.PI * 2);
      ctx.fill();

      // 躯干
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(320, 134 + Math.sin(elapsed * 4) * 8);
      ctx.lineTo(320, 200 + Math.sin(elapsed * 4) * 8);
      // 手臂舞动
      ctx.moveTo(320, 150 + Math.sin(elapsed * 4) * 8);
      ctx.lineTo(280 + Math.cos(elapsed * 6) * 30, 130 + Math.sin(elapsed * 6) * 20);
      ctx.moveTo(320, 150 + Math.sin(elapsed * 4) * 8);
      ctx.lineTo(360 - Math.cos(elapsed * 6) * 30, 130 - Math.sin(elapsed * 6) * 20);
      // 双腿舞步
      ctx.moveTo(320, 200 + Math.sin(elapsed * 4) * 8);
      ctx.lineTo(290 + Math.sin(elapsed * 5) * 25, 270);
      ctx.moveTo(320, 200 + Math.sin(elapsed * 4) * 8);
      ctx.lineTo(350 - Math.sin(elapsed * 5) * 25, 270);
      ctx.stroke();

      // 文字标题与时间戳显示
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(title, 24, 40);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px monospace';
      ctx.fillText(`节拍模拟时间: ${elapsed.toFixed(1)}s / ${durationSec}s`, 24, 70);
      ctx.fillText(`(支持: 镜像翻转M / AB循环[ ] / 慢放 / 留言)`, 24, 94);

      if (currentFrame >= totalFrames) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 1000 / 30);
  });
}
