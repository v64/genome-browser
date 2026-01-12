import { MagnitudeBadge } from './MagnitudeBadge'
import { ReputeBadge } from './ReputeBadge'
import { stripCitations } from '../utils/text'

export function SnpCard({ snp, onClick, onToggleFavorite, onTagClick }) {
  const handleFavoriteClick = (e) => {
    e.stopPropagation()
    onToggleFavorite?.(snp.rsid, snp.is_favorite)
  }

  return (
    <div
      onClick={() => onClick?.(snp)}
      className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 shrink-0">
              {snp.rsid}
            </h3>
            {snp.gene && (
              <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded truncate max-w-[150px]">
                {snp.gene}
              </span>
            )}
          </div>
          {snp.title && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {stripCitations(snp.title)}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span>Chr {snp.chromosome}</span>
            <span>•</span>
            <span>{snp.position?.toLocaleString()}</span>
            <span>•</span>
            <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
              {snp.genotype}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {snp.magnitude !== null && snp.magnitude !== undefined && (
            <MagnitudeBadge magnitude={snp.magnitude} />
          )}

          <button
            onClick={handleFavoriteClick}
            className={`p-1.5 rounded-full transition-colors ${
              snp.is_favorite
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-gray-300 hover:text-yellow-500 dark:text-gray-600'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill={snp.is_favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
        </div>
      </div>

      {snp.summary && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
          {stripCitations(snp.summary)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <ReputeBadge repute={snp.effective_repute} />

        {snp.categories?.map((cat) => (
          <button
            key={cat}
            onClick={(e) => {
              e.stopPropagation()
              onTagClick?.(cat)
            }}
            className="badge badge-category capitalize hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors cursor-pointer"
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  )
}
