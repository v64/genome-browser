import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function TagFilter({ selected, onChange }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    staleTime: 60000, // Cache for 1 minute
  })

  const tags = data?.tags || []
  // Show top 20 most common tags
  const topTags = tags.slice(0, 20)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Tags
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (topTags.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Tags
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {topTags.map(({ tag, count }) => (
          <button
            key={tag}
            onClick={() => onChange(selected === tag ? null : tag)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
              selected === tag
                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={`${count} SNPs`}
          >
            {tag}
          </button>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Clear tag filter
        </button>
      )}
    </div>
  )
}
