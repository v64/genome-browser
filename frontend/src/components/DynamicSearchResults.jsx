import { MagnitudeBadge } from './MagnitudeBadge'
import { ReputeBadge } from './ReputeBadge'
import { stripCitations } from '../utils/text'

export function DynamicSearchResults({ results, interpretation, searchType, onSnpClick }) {
  if (!results || results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 dark:text-gray-400">No matching SNPs found</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Try a different search query
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Interpretation header */}
      {interpretation && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                {interpretation}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                Found {results.length} matching SNP{results.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results grid */}
      <div className="grid gap-3">
        {results.map((snp) => (
          <div
            key={snp.rsid}
            onClick={() => onSnpClick(snp)}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 cursor-pointer transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {snp.rsid}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                    {snp.genotype}
                  </span>
                  {snp.gene && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {snp.gene}
                    </span>
                  )}
                </div>

                {/* Relevance explanation (from Claude) */}
                {snp.relevance && (
                  <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
                    {snp.relevance}
                  </p>
                )}

                {/* Interpretation (from Claude) */}
                {snp.interpretation && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                    <span className="font-medium">Your genotype: </span>
                    {snp.interpretation}
                  </p>
                )}

                {/* Fallback to summary if no Claude explanation */}
                {!snp.interpretation && !snp.relevance && snp.summary && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                    {stripCitations(snp.summary)}
                  </p>
                )}

                {/* Categories */}
                {snp.categories?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {snp.categories.map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full capitalize"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right side badges */}
              <div className="flex flex-col items-end gap-2">
                {snp.magnitude != null && (
                  <MagnitudeBadge magnitude={snp.magnitude} />
                )}
                {(snp.effective_repute) && (
                  <ReputeBadge repute={snp.effective_repute} />
                )}
              </div>
            </div>

            {/* Location info */}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>
                Chr{snp.chromosome}:{snp.position?.toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Click for details
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
