export function ReputeFilter({ selected, onChange }) {
  const options = [
    { id: null, label: 'All', color: 'gray' },
    { id: 'bad', label: 'Risk Variants', color: 'red' },
    { id: 'good', label: 'Protective', color: 'green' },
  ]

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Risk Status
      </h3>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id || 'all'}
            onClick={() => onChange(option.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selected === option.id
                ? option.color === 'red'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : option.color === 'green'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
