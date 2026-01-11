import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useFavorites() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: api.getFavorites,
  })

  const invalidateAllSnpQueries = (rsid) => {
    queryClient.invalidateQueries({ queryKey: ['favorites'] })
    queryClient.invalidateQueries({ queryKey: ['snps'] })
    queryClient.invalidateQueries({ queryKey: ['snps-by-label'] })
    queryClient.invalidateQueries({ queryKey: ['snp', rsid] })
    queryClient.invalidateQueries({ queryKey: ['snp-full', rsid] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const addMutation = useMutation({
    mutationFn: api.addFavorite,
    onSuccess: (_, rsid) => invalidateAllSnpQueries(rsid),
  })

  const removeMutation = useMutation({
    mutationFn: api.removeFavorite,
    onSuccess: (_, rsid) => invalidateAllSnpQueries(rsid),
  })

  const toggleFavorite = (rsid, isFavorite) => {
    if (isFavorite) {
      removeMutation.mutate(rsid)
    } else {
      addMutation.mutate(rsid)
    }
  }

  return {
    favorites: data?.favorites || [],
    count: data?.count || 0,
    isLoading,
    toggleFavorite,
    isToggling: addMutation.isPending || removeMutation.isPending,
  }
}
