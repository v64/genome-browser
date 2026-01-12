import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const [classifyResult, setClassifyResult] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['genotype-labels'],
    queryFn: api.getAllLabels,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const classifyMutation = useMutation({
    mutationFn: (limit) => api.batchClassifyLabels(limit),
    onSuccess: (result) => {
      setClassifyResult(result);
      queryClient.invalidateQueries({ queryKey: ['genotype-labels'] });
      queryClient.invalidateQueries({ queryKey: ['snps'] });
    },
  });

  const labels = data?.labels || [];
  const totalLabeled = labels.reduce((sum, l) => sum + l.count, 0);

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

      {/* Batch classify section */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {totalLabeled} SNPs classified
        </p>
        <button
          onClick={() => classifyMutation.mutate(50)}
          disabled={classifyMutation.isPending}
          className="w-full px-3 py-2 text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {classifyMutation.isPending ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Classifying...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>Classify 50 more</span>
            </>
          )}
        </button>
        {classifyResult && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
            Classified {classifyResult.classified} SNPs
          </p>
        )}
        {classifyMutation.isError && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Error: {classifyMutation.error?.message || 'Classification failed'}
          </p>
        )}
      </div>
    </div>
  );
}

export default LabelFilterPanel;
