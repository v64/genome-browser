export function MagnitudeBadge({ magnitude }) {
  if (magnitude === null || magnitude === undefined) {
    return null
  }

  const getMagnitudeColor = (mag) => {
    if (mag <= 2) return 'bg-green-500'
    if (mag <= 4) return 'bg-yellow-500'
    if (mag <= 6) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getMagnitudeLabel = (mag) => {
    if (mag <= 2) return 'Low'
    if (mag <= 4) return 'Moderate'
    if (mag <= 6) return 'Notable'
    return 'High'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <div
          className={`w-2 h-2 rounded-full ${getMagnitudeColor(magnitude)}`}
        />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {magnitude.toFixed(1)}
        </span>
      </div>
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getMagnitudeColor(magnitude)}`}
          style={{ width: `${Math.min(magnitude * 10, 100)}%` }}
        />
      </div>
    </div>
  )
}
