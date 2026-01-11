import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function SyncStatus() {
  const { data: status } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: api.getSyncStatus,
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  if (!status) return null

  const percentage = status.total_snps > 0
    ? ((status.annotated_snps / status.total_snps) * 100).toFixed(1)
    : 0

  return (
    <div className="flex items-center gap-3 text-sm">
      {status.is_syncing && (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <svg
            className="animate-spin h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Syncing...</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
          />
        </svg>
        <span>
          {status.annotated_snps.toLocaleString()} / {status.total_snps.toLocaleString()} annotated
        </span>
      </div>
    </div>
  )
}
