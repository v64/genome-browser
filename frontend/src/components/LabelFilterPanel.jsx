import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const labelColors = {
  normal: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  abnormal: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  rare: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  protective: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  risk: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  carrier: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

export function LabelFilterPanel({ selected, onChange }) {
  const { data, isLoading } = useQuery({
    queryKey: ['genotype-labels'],
    queryFn: api.getAllLabels,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const labels = data?.labels || [];

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Genotype Labels
        </h3>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (labels.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Genotype Labels
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No labels yet. Query your genome to have Claude classify your genotypes.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Genotype Labels
      </h3>
      <div className="space-y-1.5">
        {selected && (
          <button
            onClick={() => onChange(null)}
            className="w-full text-left px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Clear filter
          </button>
        )}
        {labels.map(({ label, count }) => {
          const isSelected = selected === label;
          const colorClass = labelColors[label.toLowerCase()] || labelColors.neutral;

          return (
            <button
              key={label}
              onClick={() => onChange(isSelected ? null : label)}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors flex items-center justify-between ${
                isSelected
                  ? `${colorClass} ring-2 ring-purple-500 dark:ring-purple-400`
                  : `${colorClass} hover:opacity-80`
              }`}
            >
              <span className="capitalize font-medium">{label}</span>
              <span className="text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LabelFilterPanel;
