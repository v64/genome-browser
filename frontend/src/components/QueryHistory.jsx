import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import ReactMarkdown from 'react-markdown';

export default function QueryHistory({ onSnpClick, onRerunQuery }) {
  const queryClient = useQueryClient();
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['queryHistory', offset],
    queryFn: () => api.getQueryHistory(limit, offset),
    keepPreviousData: true,
  });

  const handleHideEntry = async (e, entryId) => {
    e.stopPropagation();
    await api.hideQueryHistoryEntry(entryId);
    queryClient.invalidateQueries({ queryKey: ['queryHistory'] });
  };

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const hasMore = data?.has_more || false;

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isFetching) {
      setOffset((prev) => prev + limit);
    }
  }, [hasMore, isFetching]);

  const handleLoadPrevious = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - limit));
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center">
          <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
          No Query History Yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Your genome queries will appear here. Go to the Query tab to ask questions about your DNA.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Query History</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {total} total queries
          </p>
        </div>
      </div>

      {/* Query List */}
      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`card p-4 cursor-pointer transition-all ${
              selectedEntry?.id === entry.id
                ? 'ring-2 ring-purple-500 border-purple-500'
                : 'hover:border-purple-300 dark:hover:border-purple-600'
            }`}
            onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
          >
            {/* Query Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {entry.query}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(entry.created_at)}
                  </span>
                  {entry.snps_mentioned?.length > 0 && (
                    <span className="text-xs text-purple-500 dark:text-purple-400">
                      {entry.snps_mentioned.length} SNP{entry.snps_mentioned.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleHideEntry(e, entry.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Hide this query"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {onRerunQuery && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRerunQuery(entry.query);
                    }}
                    className="p-1.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                    title="Run this query again"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    selectedEntry?.id === entry.id ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded Content */}
            {selectedEntry?.id === entry.id && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                {/* Response */}
                <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                      <ReactMarkdown>{entry.response}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* SNPs Mentioned */}
                {entry.snps_mentioned?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      SNPs mentioned
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {entry.snps_mentioned.map((rsid) => (
                        <button
                          key={rsid}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSnpClick?.({ rsid });
                          }}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-mono hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          {rsid}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {(offset > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={handleLoadPrevious}
            disabled={offset === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {offset + 1} - {Math.min(offset + entries.length, total)} of {total}
          </span>
          <button
            onClick={handleLoadMore}
            disabled={!hasMore || isFetching}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isFetching ? 'Loading...' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}
