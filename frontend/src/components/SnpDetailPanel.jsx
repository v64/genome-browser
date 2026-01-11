import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { MagnitudeBadge } from './MagnitudeBadge'
import { ReputeBadge } from './ReputeBadge'
import { LabelBadge } from './LabelBadge'

// Extract text up to and including the sentence with the first citation
function getTextUpToFirstCitation(text) {
  if (!text) return '';

  // Find the first citation
  const citationMatch = text.match(/\[cite:[^\]]+\]/);
  if (!citationMatch) {
    // No citation, return first 4 sentences
    const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)/g;
    const sentences = text.match(sentenceRegex) || [];
    return sentences.slice(0, 4).join('').trim();
  }

  // Find where the first citation is
  const citationIndex = citationMatch.index;

  // Get text up to and past the citation, then find the end of that sentence
  const textUpToCitation = text.substring(0, citationIndex + citationMatch[0].length);
  const textAfterCitation = text.substring(citationIndex + citationMatch[0].length);

  // Find the end of the sentence after the citation
  const sentenceEndMatch = textAfterCitation.match(/[^.!?]*[.!?]/);
  const sentenceEnd = sentenceEndMatch ? sentenceEndMatch[0] : '';

  return (textUpToCitation + sentenceEnd).trim();
}

// Simple citation renderer - shows citations as styled text (view full page for clickable)
function TextWithCitations({ text }) {
  if (!text) return null;

  // Split text by citation pattern [cite:...]
  const parts = text.split(/(\[cite:[^\]]+\])/g);

  return (
    <span>
      {parts.map((part, idx) => {
        const citeMatch = part.match(/\[cite:([^\]]+)\]/);
        if (citeMatch) {
          return (
            <span
              key={idx}
              className="inline-flex items-center px-1 mx-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs"
              title="View full page for source details"
            >
              [{citeMatch[1].replace(/^(knowledge_|datalog_|chat_?)/, '')}]
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

export function SnpDetailPanel({ rsid, onClose, onToggleFavorite, onAskClaude, onViewFullPage, onTagClick }) {
  const queryClient = useQueryClient()
  const [explaining, setExplaining] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState('')
  const [editedGenotypes, setEditedGenotypes] = useState({})
  const [showAllCategories, setShowAllCategories] = useState(false)

  const { data: snp, isLoading, error } = useQuery({
    queryKey: ['snp', rsid],
    queryFn: () => api.getSnp(rsid),
    enabled: !!rsid,
  })

  // Fetch genotype label
  const { data: labelData } = useQuery({
    queryKey: ['label', rsid],
    queryFn: () => api.getLabel(rsid),
    enabled: !!rsid,
  })

  // Update edited values when snp loads
  useEffect(() => {
    if (snp) {
      setEditedSummary(snp.summary || '')
      setEditedGenotypes(snp.genotype_info || {})
    }
  }, [snp])

  // Reset category expansion when switching SNPs
  useEffect(() => {
    setShowAllCategories(false)
  }, [rsid])

  const explainMutation = useMutation({
    mutationFn: (rsid) => api.explainSnp(rsid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] })
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
      setExplaining(false)
      onAskClaude?.()
    },
    onError: () => {
      setExplaining(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ rsid, data }) => api.editAnnotation(rsid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snp', rsid] })
      setEditing(false)
    },
  })

  const revertMutation = useMutation({
    mutationFn: (rsid) => api.revertAnnotation(rsid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snp', rsid] })
    },
  })

  const handleAskClaude = () => {
    setExplaining(true)
    explainMutation.mutate(rsid)
  }

  const handleSaveEdit = () => {
    editMutation.mutate({
      rsid,
      data: {
        summary: editedSummary,
        genotype_info: editedGenotypes,
      },
    })
  }

  const handleRevert = () => {
    if (confirm('Revert to original SNPedia annotation?')) {
      revertMutation.mutate(rsid)
    }
  }

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, editing])

  if (!rsid) return null

  const getSourceBadge = (source) => {
    if (source === 'claude') {
      return (
        <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
          Improved by Claude
        </span>
      )
    }
    if (source === 'user') {
      return (
        <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
          Edited by you
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
        SNPedia
      </span>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {rsid}
              </h2>
              {snp?.source && getSourceBadge(snp.source)}
            </div>
            {snp?.title && (
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {snp.title}
              </p>
            )}
            {snp?.gene && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Gene: {snp.gene}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-500">
              Error loading SNP details
            </div>
          )}

          {snp && (
            <div className="space-y-6">
              {/* Action Buttons */}
              {!editing && (
                <div className="space-y-2">
                  <button
                    onClick={() => onViewFullPage?.(rsid)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span>View Full Page</span>
                  </button>

                  <button
                    onClick={handleAskClaude}
                    disabled={explaining}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {explaining ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Asking Claude...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <span>Ask Claude about this SNP</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`https://www.snpedia.com/index.php/${rsid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary w-full text-center inline-block"
                  >
                    View on SNPedia
                  </a>
                </div>
              )}

              {/* Gene Card - Summary view like browse results */}
              <div className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* RS Number + Gene */}
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                        {snp.rsid}
                      </h3>
                      {snp.gene && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
                          {snp.gene}
                        </span>
                      )}
                    </div>
                    {/* Title */}
                    {snp.title && (
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {snp.title}
                      </p>
                    )}
                    {/* Chr • Position • Genotype */}
                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>Chr {snp.chromosome}</span>
                      <span>•</span>
                      <span>{snp.position?.toLocaleString()}</span>
                      <span>•</span>
                      <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                        {snp.matched_genotype || snp.genotype}
                      </span>
                    </div>
                  </div>
                  {/* Magnitude + Star */}
                  <div className="flex items-center gap-2">
                    {snp.magnitude !== null && snp.magnitude !== undefined && (
                      <div className="flex items-center gap-1">
                        <MagnitudeBadge magnitude={snp.magnitude} />
                      </div>
                    )}
                    <button
                      onClick={() => onToggleFavorite?.(snp.rsid, snp.is_favorite)}
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
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 mb-3">
                    <TextWithCitations text={getTextUpToFirstCitation(snp.summary)} />
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <ReputeBadge repute={snp.repute} />
                  {labelData?.label && (
                    <LabelBadge label={labelData.label} size="sm" />
                  )}
                  {(showAllCategories ? snp.categories : snp.categories?.slice(0, 3))?.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => onTagClick?.(cat)}
                      className="badge badge-category capitalize hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors cursor-pointer"
                    >
                      {cat}
                    </button>
                  ))}
                  {snp.categories?.length > 3 && (
                    <button
                      onClick={() => setShowAllCategories(!showAllCategories)}
                      className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {showAllCategories ? 'less' : `+${snp.categories.length - 3} more`}
                    </button>
                  )}
                </div>
              </div>

              {/* Your Genotype */}
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Your Genotype
                  </h3>
                  <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
                    {snp.matched_genotype || snp.genotype}
                  </span>
                  {snp.matched_genotype && snp.matched_genotype !== snp.genotype && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      (23andMe reports {snp.genotype} on opposite strand)
                    </span>
                  )}
                </div>

                {snp.your_interpretation && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      What this means for you:
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      <TextWithCitations text={snp.your_interpretation} />
                    </p>
                  </div>
                )}
              </div>

              {/* Summary - Editable */}
              {(snp.summary || editing) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Summary
                    </h3>
                    {!editing && snp.has_annotation && (
                      <button
                        onClick={() => setEditing(true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editing ? (
                    <textarea
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={4}
                    />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300">
                      <TextWithCitations text={snp.summary} />
                    </p>
                  )}
                </div>
              )}

              {/* Genotype Interpretation - Editable */}
              {(snp.genotype_info && Object.keys(snp.genotype_info).length > 0) || editing ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    All Genotype Variants
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(editing ? editedGenotypes : snp.genotype_info || {}).map(([gt, info]) => {
                      const isYours = gt === snp.genotype || gt === snp.matched_genotype
                      return (
                        <div
                          key={gt}
                          className={`p-3 rounded-lg ${
                            isYours
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                              : 'bg-gray-50 dark:bg-gray-700/50'
                          }`}
                        >
                          <span className="font-mono font-semibold">
                            {gt}
                            {isYours && (
                              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                                (You{gt !== snp.genotype ? ` - your ${snp.genotype} on opposite strand` : ''})
                              </span>
                            )}
                          </span>
                          {editing ? (
                            <textarea
                              value={editedGenotypes[gt] || ''}
                              onChange={(e) =>
                                setEditedGenotypes({ ...editedGenotypes, [gt]: e.target.value })
                              }
                              className="w-full mt-2 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              rows={2}
                            />
                          ) : (
                            <p className="text-sm mt-1 text-gray-600 dark:text-gray-300">
                              <TextWithCitations text={info} />
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {/* Edit mode buttons */}
              {editing && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={editMutation.isPending}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {editMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setEditedSummary(snp.summary || '')
                      setEditedGenotypes(snp.genotype_info || {})
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* References */}
              {snp.references?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    References
                  </h3>
                  <ul className="space-y-1">
                    {snp.references.map((ref, i) => (
                      <li key={i}>
                        <a
                          href={ref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block"
                        >
                          {ref}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </>
  )
}
