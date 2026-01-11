import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { LabelBadge } from './LabelBadge';
import { api } from '../api/client';

const DEFAULT_SUGGESTIONS = [
  "What are my most significant genetic variants?",
  "Do I have any risk variants for common diseases?",
  "What genes affect my metabolism?",
  "Tell me about my ancestry-related SNPs"
];

export default function GenomeQuery({
  onSnpClick,
  query,
  setQuery,
  loading,
  setLoading,
  results,
  setResults,
  error,
  setError
}) {
  const [labels, setLabels] = useState({});
  const [improvedSnps, setImprovedSnps] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsLoadedRef = useRef(false);
  const pollIntervalRef = useRef(null);

  // Fetch personalized suggestions on mount (only once)
  useEffect(() => {
    if (suggestionsLoadedRef.current) return;
    suggestionsLoadedRef.current = true;

    const fetchSuggestions = async () => {
      setSuggestionsLoading(true);
      try {
        const response = await fetch('http://localhost:8000/api/agent/suggestions');
        if (response.ok) {
          const data = await response.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
          }
        }
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
        // Keep default suggestions on error
      } finally {
        setSuggestionsLoading(false);
      }
    };

    fetchSuggestions();
  }, []);

  // Fetch labels when results change
  useEffect(() => {
    if (results?.snps_found?.length > 0) {
      const rsids = results.snps_found.map(snp => snp.rsid);
      api.getLabelsBatch(rsids)
        .then(data => setLabels(data.labels || {}))
        .catch(err => console.error('Failed to fetch labels:', err));
    }
  }, [results]);

  // Poll for improvements when there are pending improvements
  useEffect(() => {
    const pending = results?.pending_improvements || [];
    setPendingCount(pending.length);

    if (pending.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Poll every 3 seconds for improvement status
    const checkImprovements = async () => {
      let stillPending = 0;

      for (const rsid of pending) {
        try {
          const annotation = await api.getAnnotation(rsid);
          if (annotation?.improved_at || annotation?.source === 'claude') {
            // Update improved state
            setImprovedSnps(prev => ({
              ...prev,
              [rsid]: {
                title: annotation.title,
                improved_at: annotation.improved_at
              }
            }));

            // Update the SNP in results with new data
            setResults(prev => {
              if (!prev) return prev;
              // Check if already updated
              const existingSnp = prev.snps_found.find(s => s.rsid === rsid);
              if (existingSnp?.is_improved) return prev;

              const updatedSnps = prev.snps_found.map(snp => {
                if (snp.rsid === rsid) {
                  return {
                    ...snp,
                    title: annotation.title,
                    gene: annotation.gene || snp.gene,
                    repute: annotation.repute || snp.repute,
                    magnitude: annotation.magnitude ?? snp.magnitude,
                    categories: annotation.categories,
                    summary: annotation.summary,
                    is_improved: true
                  };
                }
                return snp;
              });
              return { ...prev, snps_found: updatedSnps };
            });
          } else {
            stillPending++;
          }
        } catch (err) {
          console.error(`Failed to check ${rsid}:`, err);
          stillPending++;
        }
      }

      setPendingCount(stillPending);

      // Stop polling if all done
      if (stillPending === 0 && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    // Start polling
    pollIntervalRef.current = setInterval(checkImprovements, 3000);

    // Initial check after 2 seconds
    setTimeout(checkImprovements, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [results?.pending_improvements]);

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResults(null); // Clear old results to show loading spinner
    setLabels({}); // Clear labels too
    setImprovedSnps({}); // Clear improved state
    setPendingCount(0);

    try {
      const res = await fetch('http://localhost:8000/api/agent/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });

      if (!res.ok) {
        throw new Error('Query failed');
      }

      const data = await res.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
      console.error('Query error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Query Bar */}
      <div className="max-w-3xl mx-auto">
        <form onSubmit={handleQuery}>
          <div className="space-y-3">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your genome..."
              rows={5}
              className="w-full px-5 py-4 text-lg bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 text-gray-900 dark:text-white placeholder-gray-400 resize-none"
              disabled={loading}
            />
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Querying
                  </span>
                ) : (
                  'Query'
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {suggestionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading suggestions...
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setQuery(suggestion)}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {suggestion}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-3xl mx-auto p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Summary Answer */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-200 dark:border-purple-800 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Summary</h3>
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-purple-700 dark:prose-strong:text-purple-300">
                  <ReactMarkdown>{results.claude_response}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          {/* Gene-by-Gene Breakdown */}
          {results.snps_found && results.snps_found.length > 0 && (() => {
            // Split into genes with info and without
            const hasNoInfo = (snp) => {
              const text = (snp.interpretation || '').toLowerCase();
              return text.includes("don't have specific") ||
                     text.includes("do not have specific") ||
                     text.includes("no specific information") ||
                     text.includes("limited information") ||
                     text.includes("not well-studied") ||
                     text.includes("no available information") ||
                     !snp.interpretation;
            };

            const genesWithInfo = results.snps_found.filter(snp => !hasNoInfo(snp));
            const genesWithoutInfo = results.snps_found.filter(snp => hasNoInfo(snp));

            return (
              <>
                {/* Genes with specific information */}
                {genesWithInfo.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Your Genes ({genesWithInfo.length})
                      </h3>
                      {pendingCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-purple-500 animate-pulse">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Enriching {pendingCount} gene{pendingCount !== 1 ? 's' : ''}...
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {genesWithInfo.map((snp) => (
                        <div
                          key={snp.rsid}
                          onClick={() => onSnpClick?.({ rsid: snp.rsid })}
                          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md cursor-pointer transition-all"
                        >
                          {/* Header row */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-purple-600 dark:text-purple-400 font-semibold">
                                {snp.rsid}
                              </span>
                              {snp.gene && (
                                <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                  {snp.gene}
                                </span>
                              )}
                              {snp.chromosome && (
                                <span className="text-xs text-gray-500 dark:text-gray-500">
                                  Chr {snp.chromosome}
                                </span>
                              )}
                              {snp.is_improved ? (
                                <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                                  ✓ enriched
                                </span>
                              ) : results.pending_improvements?.includes(snp.rsid) && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded text-xs">
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Improving...
                                </span>
                              )}
                            </div>
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          {/* Title */}
                          {snp.title && (
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              {snp.title}
                            </p>
                          )}

                          {/* Genotype badge */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Your genotype:</span>
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold font-mono">
                              {snp.genotype}
                            </span>
                            {labels[snp.rsid]?.label && (
                              <LabelBadge label={labels[snp.rsid].label} size="xs" />
                            )}
                            {snp.repute && (
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                snp.repute === 'good'
                                  ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                  : snp.repute === 'bad'
                                  ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                              }`}>
                                {snp.repute === 'good' ? 'Favorable' : snp.repute === 'bad' ? 'Risk variant' : 'Neutral'}
                              </span>
                            )}
                          </div>

                          {/* Tags */}
                          {snp.categories && (() => {
                            try {
                              const cats = typeof snp.categories === 'string' ? JSON.parse(snp.categories) : snp.categories;
                              if (Array.isArray(cats) && cats.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {cats.map((cat, idx) => (
                                      <span
                                        key={idx}
                                        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs"
                                      >
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                            } catch (e) {}
                            return null;
                          })()}

                          {/* Interpretation */}
                          {snp.interpretation && (
                            <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed prose prose-xs dark:prose-invert max-w-none prose-p:my-0.5">
                              <ReactMarkdown>{snp.interpretation}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Genes without specific information */}
                {genesWithoutInfo.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      Other mentioned genes - no specific information ({genesWithoutInfo.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {genesWithoutInfo.map((snp) => (
                        <button
                          key={snp.rsid}
                          onClick={() => onSnpClick?.({ rsid: snp.rsid })}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs hover:border-purple-300 dark:hover:border-purple-600 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-all"
                        >
                          <span className="font-mono text-purple-600 dark:text-purple-400">
                            {snp.rsid}
                          </span>
                          {snp.gene && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {snp.gene}
                            </span>
                          )}
                          <span className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs font-mono">
                            {snp.genotype}
                          </span>
                          {results.pending_improvements?.includes(snp.rsid) && !snp.is_improved && (
                            <svg className="w-3 h-3 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* No SNPs found in genome */}
          {results.snps_found && results.snps_found.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No matching SNPs found in your genome data for this query.</p>
              <p className="text-sm mt-1">The SNPs mentioned by Claude may not be in your 23andMe results.</p>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Claude is analyzing your genome...
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Finding relevant SNPs, looking up your genotypes, and generating personalized interpretations.
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-3">
              You can switch tabs - your results will be here when you come back.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
            Ask About Your Genome
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Ask any question and Claude will search your genome data, find relevant SNPs, and explain what your genotypes mean for you personally.
          </p>
        </div>
      )}
    </div>
  );
}
