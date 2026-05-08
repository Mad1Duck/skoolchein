/** Skeleton loader for cards / lists */
export function NeoSkeleton({
  className = "",
  lines = 1,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="neo-skeleton h-4 rounded"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

/** Full card skeleton */
export function NeoCardSkeleton() {
  return (
    <div className="neo-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="neo-skeleton h-5 w-16 rounded-sm" />
        <div className="neo-skeleton h-5 w-10 rounded-sm ml-auto" />
      </div>
      <div className="neo-skeleton h-6 w-3/4 rounded-sm" />
      <div className="neo-skeleton h-4 w-1/2 rounded-sm" />
      <div className="space-y-2 pt-2">
        <div className="neo-skeleton h-3 rounded-sm" />
        <div className="neo-skeleton h-3 w-5/6 rounded-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t-2 border-gray-100">
        <div className="neo-skeleton h-8 rounded-sm" />
        <div className="neo-skeleton h-8 rounded-sm" />
        <div className="neo-skeleton h-8 rounded-sm" />
      </div>
    </div>
  );
}
