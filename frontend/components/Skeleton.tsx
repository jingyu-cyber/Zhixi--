"use client";

/**
 * 骨架屏加载组件 — 用于内容加载时的占位
 *
 * 用法:
 *   <Skeleton className="h-4 w-3/4" />
 *   <CardSkeleton />
 *   <TreeSkeleton />
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 ${
        className || ""
      }`}
    />
  );
}

/** 卡片骨架屏 */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** 列表骨架屏 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"
        >
          <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 知识树骨架屏 */
export function TreeSkeleton({ depth = 3 }: { depth?: number }) {
  return (
    <div className="space-y-2 pl-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2 py-2">
            <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
            <Skeleton className="h-4 w-32" />
          </div>
          {depth > 1 && (
            <div className="pl-6 space-y-2">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2 py-1">
                  <Skeleton className="h-4 w-4 rounded flex-shrink-0" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 3D 图谱加载占位 */
export function GraphSkeleton() {
  return (
    <div className="relative w-full h-full min-h-[400px] bg-gray-950 rounded-xl flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">正在加载知识图谱…</p>
      </div>
    </div>
  );
}
