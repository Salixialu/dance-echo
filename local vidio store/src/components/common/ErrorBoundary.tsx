import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 最外层错误边界：任何渲染期异常都不再整页白屏。
 * 数据安全提示很重要——视频在磁盘、元数据在服务端，崩溃不会丢数据。
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DanceEcho] 渲染异常已兜底', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-200">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm font-medium">界面出了点问题 · Something went wrong</div>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
            视频与练习数据都在磁盘和服务端，没有丢失。可以先点重试；如果反复出现，刷新页面后把下面的错误信息发给我。
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[10px] text-red-300">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-zinc-200 transition hover:bg-white/10"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-medium text-zinc-900 transition hover:bg-white"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
