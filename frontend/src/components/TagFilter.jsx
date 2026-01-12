import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function TagFilter({ selected, onChange }) {
  const [search, setSearch] = useState('')
  const [showRare, setShowRare] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    staleTime: 60000, // Cache for 1 minute
  })

  const allTags = data?.tags || []

  // Filter tags based on search and minimum count
  const minCount = showRare ? 5 : 20
  const filteredTags = useMemo(() => {
    let result = allTags.filter(t => t.count >= minCount)
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = allTags.filter(t =>
        t.tag.toLowerCase().includes(searchLower) && t.count >= (showRare ? 1 : 5)
      )
    }
    return result.slice(0, 100) // Cap at 100 for performance
  }, [allTags, search, minCount, showRare])

  // Parse selected into array (comma-separated string or null)
  const selectedTags = selected ? selected.split(',').map(t => t.trim()) : []

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      // Remove tag
      const newTags = selectedTags.filter(t => t !== tag)
      onChange(newTags.length > 0 ? newTags.join(',') : null)
    } else {
      // Add tag
      onChange([...selectedTags, tag].join(','))
    }
  }

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

  const commonCount = allTags.filter(t => t.count >= 20).length
  const rareCount = allTags.filter(t => t.count >= 5).length

  if (allTags.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Tags
      </h3>

      <input
        type="text"
        placeholder="Search tags..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
      />

      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
        {filteredTags.map(({ tag, count }) => {
          const isSelected = selectedTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={`${count} SNPs`}
            >
              {tag}
            </button>
          )
        })}
        {filteredTags.length === 0 && search && (
          <span className="text-xs text-gray-500">No tags match "{search}"</span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <label className="flex items-center gap-1 text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showRare}
            onChange={(e) => setShowRare(e.target.checked)}
            className="w-3 h-3"
          />
          <span>Include rare ({rareCount - commonCount} more)</span>
        </label>
        {selectedTags.length > 0 && (
          <button
            onClick={() => onChange(null)}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear {selectedTags.length > 1 ? `${selectedTags.length} tags` : 'tag'}
          </button>
        )}
      </div>
    </div>
  )
}
