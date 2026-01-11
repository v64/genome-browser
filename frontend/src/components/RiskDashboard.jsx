import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { MagnitudeBadge } from './MagnitudeBadge'
import { ReputeBadge } from './ReputeBadge'
import { LabelBadge } from './LabelBadge'

export function RiskDashboard({ onSnpClick }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const activityStats = dashboard?.activity_stats || {}
  const interestingSnps = dashboard?.interesting_snps || []

  // Separate into categories based on why they're interesting
  const recentlyActive = interestingSnps.filter(s => s.last_active)
  const favorites = interestingSnps.filter(s => s.is_favorite)
  const labeled = interestingSnps.filter(s => s.has_label)
  const improved = interestingSnps.filter(s => s.is_improved)

  return (
    <div className="space-y-8">
      {/* Activity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
          <p className="text-sm text-purple-600 dark:text-purple-400">Genome Queries</p>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
            {activityStats.total_queries || 0}
          </p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-600 dark:text-blue-400">Claude Improved</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {activityStats.claude_improved_snps || 0}
          </p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-600 dark:text-amber-400">Favorites</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
            {activityStats.favorite_snps || 0}
          </p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <p className="text-sm text-green-600 dark:text-green-400">Labeled</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {activityStats.labeled_snps || 0}
          </p>
        </div>
      </div>

      {/* Genome Stats Bar */}
      <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
        <span>{dashboard?.total_snps?.toLocaleString()} total SNPs</span>
        <span className="text-gray-300 dark:text-gray-600">•</span>
        <span>{dashboard?.annotated_snps?.toLocaleString()} annotated</span>
        <span className="text-gray-300 dark:text-gray-600">•</span>
        <span>{activityStats.knowledge_entries || 0} knowledge entries</span>
        <span className="text-gray-300 dark:text-gray-600">•</span>
        <span>{activityStats.recent_activity_count || 0} actions this week</span>
      </div>

      {/* Most Interesting Genes */}
      {interestingSnps.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Most Interesting Genes
            </h2>
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-xs font-medium">
              Ranked by activity
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            These genes have the highest interest scores based on your browsing history, queries, favorites, labels, and data richness.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interestingSnps.slice(0, 10).map((snp, index) => (
              <button
                key={snp.rsid}
                onClick={() => onSnpClick?.(snp)}
                className="card p-4 text-left hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-600 transition-all group"
              >
                {/* Rank Badge */}
                <div className="absolute -top-2 -left-2 w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                  {index + 1}
                </div>

                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                      {snp.rsid}
                    </span>
                    {snp.gene && (
                      <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                        {snp.gene}
                      </span>
                    )}
                    {snp.is_improved && (
                      <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                        ✓ enriched
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={snp.is_favorite ? "text-amber-500" : "text-gray-400 dark:text-gray-600"}
                      title={snp.is_favorite ? "Favorite" : "Not favorited"}
                    >
                      {snp.is_favorite ? "★" : "☆"}
                    </span>
                    <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                      {snp.genotype}
                    </span>
                  </div>
                </div>

                {/* Title */}
                {snp.title && (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 line-clamp-1">
                    {snp.title}
                  </p>
                )}

                {/* Summary */}
                {snp.summary && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                    {snp.summary}
                  </p>
                )}

                {/* Badges Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <MagnitudeBadge magnitude={snp.magnitude} />
                  <ReputeBadge repute={snp.repute} />
                  {snp.label && <LabelBadge label={snp.label} size="sm" />}
                  {snp.categories?.slice(0, 2).map((cat) => (
                    <span key={cat} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                      {cat}
                    </span>
                  ))}
                </div>

                {/* Activity Indicators */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                  {snp.access_count > 0 && (
                    <span title="Times accessed">
                      <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {snp.access_count}
                    </span>
                  )}
                  {snp.mention_count > 0 && (
                    <span title="Chat mentions">
                      <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {snp.mention_count}
                    </span>
                  )}
                  {snp.knowledge_count > 0 && (
                    <span title="Knowledge entries">
                      <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      {snp.knowledge_count}
                    </span>
                  )}
                  {snp.last_active && (
                    <span className="text-purple-400 dark:text-purple-500" title="Recent activity">
                      • Active recently
                    </span>
                  )}
                  <span className="ml-auto text-purple-500 dark:text-purple-400 font-medium" title="Interest score">
                    Score: {Math.round(snp.interest_score)}
                  </span>
                </div>

                {/* Hover Arrow */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {interestingSnps.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Start Exploring Your Genome
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Browse genes, ask questions, and favorite interesting variants. Your most interesting genes will appear here based on your activity.
          </p>
        </div>
      )}

      {/* More Genes Section */}
      {interestingSnps.length > 10 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            More interesting genes
          </h3>
          <div className="flex flex-wrap gap-2">
            {interestingSnps.slice(10).map((snp) => (
              <button
                key={snp.rsid}
                onClick={() => onSnpClick?.(snp)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
              >
                <span className="font-mono text-purple-600 dark:text-purple-400">{snp.rsid}</span>
                {snp.gene && <span className="text-gray-500 dark:text-gray-400">{snp.gene}</span>}
                <span className="text-xs text-gray-400">{Math.round(snp.interest_score)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
