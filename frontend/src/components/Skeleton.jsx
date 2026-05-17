export function Skeleton({ className = '', height = 16, width }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width: width ?? '100%' }}
    />
  )
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <Skeleton width="40%" height={12} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={20} />
      ))}
    </div>
  )
}
