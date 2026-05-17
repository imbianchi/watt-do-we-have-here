export default function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-2">
      <div className="text-5xl opacity-60">{icon}</div>
      <div className="text-gray-300 font-medium">{title}</div>
      {hint && <div className="text-xs text-gray-500 max-w-sm">{hint}</div>}
    </div>
  )
}
