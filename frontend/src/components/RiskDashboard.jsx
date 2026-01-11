import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { MagnitudeBadge } from './MagnitudeBadge'
import { ReputeBadge } from './ReputeBadge'

export function RiskDashboard({ onSnpClick }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const categoryLabels = {
    health: 'Health & Medical',
    traits: 'Physical Traits',
    intelligence: 'Cognitive',
    ancestry: 'Ancestry',
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total SNPs</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {dashboard?.total_snps?.toLocaleString()}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Annotated</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {dashboard?.annotated_snps?.toLocaleString()}
          </p>
        </div>
        {Object.entries(dashboard?.category_counts || {}).slice(0, 2).map(([cat, count]) => (
          <div key={cat} className="card p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {categoryLabels[cat] || cat}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {count?.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Notable Variants */}
      {dashboard?.notable_variants?.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Notable Variants
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            These SNPs have higher significance scores based on research. Click to learn more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dashboard.notable_variants.map((snp) => (
              <button
                key={snp.rsid}
                onClick={() => onSnpClick?.(snp)}
                className="card p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {snp.rsid}
                      </span>
                      {snp.gene && (
                        <span className="text-sm text-gray-500">({snp.gene})</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {snp.summary || 'No summary available'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-4">
                    <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                      {snp.genotype}
                    </span>
                    <MagnitudeBadge magnitude={snp.magnitude} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <ReputeBadge repute={snp.repute} />
                  {snp.categories?.slice(0, 2).map((cat) => (
                    <span key={cat} className="badge badge-category capitalize">
                      {cat}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {dashboard?.notable_variants?.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No notable variants found yet.</p>
          <p className="text-sm mt-1">Annotations are being fetched in the background.</p>
        </div>
      )}
    </div>
  )
}
