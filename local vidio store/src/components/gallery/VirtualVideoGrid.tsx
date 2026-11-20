import { GALLERY_GAP } from '../../utils/galleryRows';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import type { VideoItem } from '../../types';
import { VideoCard } from './VideoCard';

interface Props {
  videos: readonly VideoItem[];
  columns: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  /** 网格容器的额外 class（默认沿用首页的 6 列栅格断点）。 */
  className?: string;
  /** 分组内部视图里每张卡的组名都一样，交给 VideoCard 决定是否显示。 */
  showGroup?: boolean;
}

/**
 * 平铺视频网格的虚拟化外壳。
 *
 * 1401 条视频的分组视图以前是 `displayVideos.map()` 全量渲染：32462 个 DOM 节点、
 * 2802 个 <img>，进组一次就要一秒多。这里改成只渲染视口内的行，其余用绝对定位占位。
 */
export function VirtualVideoGrid({ videos, columns, scrollRef, className = '', showGroup = true }: Props) {
  const { innerRef, laid, range } = useVirtualGrid(scrollRef, videos, columns);

  return (
    <div ref={innerRef} data-testid="virtual-video-grid" className={`relative ${className}`} style={{ height: laid.total }}>
      {laid.items.slice(range.start, range.end).map((unit) => (
        <div
          key={unit.key}
          className="absolute inset-x-0 grid items-start"
          style={{
            top: unit.top,
            height: unit.height,
            gap: GALLERY_GAP,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {unit.row.map((video) => (
            <VideoCard key={video.id} video={video} showGroup={showGroup} />
          ))}
        </div>
      ))}
    </div>
  );
}
