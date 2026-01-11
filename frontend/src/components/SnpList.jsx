import { SnpCard } from './SnpCard'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

export function SnpList({
  snps,
  isLoading,
  hasMore,
  onLoadMore,
  onSnpClick,
  onToggleFavorite,
  emptyMessage = "No SNPs found",
}) {
  const loadMoreRef = useInfiniteScroll(onLoadMore, hasMore, isLoading)

  if (!isLoading && snps.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="mt-2 text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {snps.map((snp) => (
        <SnpCard
          key={snp.rsid}
          snp={snp}
          onClick={onSnpClick}
          onToggleFavorite={onToggleFavorite}
        />
      ))}

      {/* Loading indicator / infinite scroll trigger */}
      <div ref={loadMoreRef} className="py-4 text-center">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <svg
              className="animate-spin h-5 w-5"
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
            <span>Loading...</span>
          </div>
        )}

        {!isLoading && hasMore && (
          <button
            onClick={onLoadMore}
            className="btn btn-secondary"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  )
}
