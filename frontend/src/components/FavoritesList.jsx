import { useFavorites } from '../hooks/useFavorites'
import { SnpCard } from './SnpCard'

export function FavoritesList({ onSnpClick }) {
  const { favorites, count, isLoading, toggleFavorite } = useFavorites()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (count === 0) {
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
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          No favorites yet
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Click the star on any SNP to add it to your favorites
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {count} favorite{count !== 1 ? 's' : ''}
      </p>
      <div className="space-y-3">
        {favorites.map((snp) => (
          <SnpCard
            key={snp.rsid}
            snp={snp}
            onClick={onSnpClick}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </div>
  )
}
