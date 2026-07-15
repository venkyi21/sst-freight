import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCustomsFilings } from '../api/customs'

export function customsFilingsQueryKey(orgId: string) {
  return ['customsFilings', orgId] as const
}

export function useCustomsFilings(orgId: string) {
  return useQuery({
    queryKey: customsFilingsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchCustomsFilings(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useInvalidateCustomsFilings(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: customsFilingsQueryKey(orgId) })
}
