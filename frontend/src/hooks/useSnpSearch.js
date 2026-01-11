import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useSnpSearch(params) {
  return useQuery({
    queryKey: ['snps', params],
    queryFn: () => api.searchSnps(params),
    keepPreviousData: true,
  })
}

export function useSnpDetail(rsid) {
  return useQuery({
    queryKey: ['snp', rsid],
    queryFn: () => api.getSnp(rsid),
    enabled: !!rsid,
  })
}
