import { useQuery } from '@tanstack/react-query'
import { fetchSubscription } from '../api/billing'

export function subscriptionQueryKey(orgId: string) {
  return ['subscription', orgId] as const
}

export function useSubscription(orgId: string | undefined) {
  return useQuery({
    queryKey: subscriptionQueryKey(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await fetchSubscription(orgId!)
      if (error) throw new Error(error)
      return data
    },
  })
}
