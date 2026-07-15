import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchShipments, insertShipment } from '../api/shipments'
import type { ShipmentMode } from '../types'

// Every key here is namespaced by org id — switching orgs must never serve another tenant's
// cached rows (the one real regression risk react-query introduces, verified directly).
export function shipmentsQueryKey(orgId: string) {
  return ['shipments', orgId] as const
}

export function useShipments(orgId: string | null) {
  return useQuery({
    queryKey: shipmentsQueryKey(orgId ?? ''),
    queryFn: async () => {
      const { data, error } = await fetchShipments(orgId as string)
      if (error) throw new Error(error)
      return data ?? []
    },
    enabled: Boolean(orgId),
  })
}

export function useCreateShipment(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, mode }: { payload: Record<string, unknown>; mode: ShipmentMode }) => insertShipment(payload, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(orgId) })
    },
  })
}
