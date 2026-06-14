"use client";

/**
 * 空状态组件 — 用于无数据时的友好提示
 *
 * 用法:
 *   <EmptyState
 *     icon="📭"
 *     title="还没有视频"
 *     description="登录并导入你的收藏视频开始构建知识库"
 *     action={{ label: "开始导入", onClick: () => {} }}
 *   />
 */
interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon = "📭",
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4">
      <span className="text-5xl mb-2">{icon}</span>
      <h3 className="text-lg font-medium text-[var(--ink)]">{title}</h3>
      <p className="text-sm text-[var(--ink-muted)] max-w-sm text-center leading-relaxed">
        {description}
      </p>
      <div className="flex gap-3 mt-2">
        {action && (
          <button
            onClick={action.onClick}
            className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-all"
          >
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-gray-50 transition-all"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
