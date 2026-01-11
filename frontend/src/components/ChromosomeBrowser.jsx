import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

// Approximate chromosome sizes (for proportional display)
const chromosomeSizes = {
  '1': 249, '2': 243, '3': 198, '4': 191, '5': 181, '6': 171,
  '7': 159, '8': 146, '9': 141, '10': 136, '11': 135, '12': 134,
  '13': 115, '14': 107, '15': 102, '16': 90, '17': 81, '18': 78,
  '19': 59, '20': 63, '21': 48, '22': 51, 'X': 155, 'Y': 59, 'MT': 1
}

const maxSize = Math.max(...Object.values(chromosomeSizes))

export function ChromosomeBrowser({ selected, onChange }) {
  const { data: chromosomes, isLoading } = useQuery({
    queryKey: ['chromosomes'],
    queryFn: api.getChromosomes,
  })

  if (isLoading) {
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Chromosomes
        </h3>
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    )
  }

  const chrMap = Object.fromEntries(
    chromosomes?.map((c) => [c.chromosome, c.count]) || []
  )

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        Chromosomes
      </h3>

      <div className="flex flex-wrap gap-1">
        {Object.entries(chromosomeSizes).map(([chr, size]) => {
          const count = chrMap[chr] || 0
          const isSelected = selected === chr
          const width = Math.max((size / maxSize) * 100, 20)

          return (
            <button
              key={chr}
              onClick={() => onChange(isSelected ? null : chr)}
              className={`relative h-8 rounded text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-blue-500 text-white ring-2 ring-blue-300 dark:ring-blue-700'
                  : count > 0
                  ? 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              }`}
              style={{ width: `${width}%`, minWidth: '28px' }}
              disabled={count === 0}
              title={`Chr ${chr}: ${count.toLocaleString()} SNPs`}
            >
              {chr}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Chromosome {selected}: {chrMap[selected]?.toLocaleString()} SNPs
          </span>
          <button
            onClick={() => onChange(null)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
