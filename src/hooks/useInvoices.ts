import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveInvoiceToggle, fetchCosts, fetchInvoices, markCostInstantPayout, markInvoicePaid } from '../api/accounting'
import type { Invoice, ShipmentCost } from '../types'

export function invoicesQueryKey(orgId: string) {
  return ['invoices', orgId] as const
}

export function useInvoices(orgId: string) {
  return useQuery({
    queryKey: invoicesQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchInvoices(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useMarkInvoicePaid(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invoice: Invoice) => markInvoicePaid(invoice.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invoicesQueryKey(orgId) })
    },
  })
}

export function useArchiveInvoice(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invoice: Invoice) => archiveInvoiceToggle(invoice),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invoicesQueryKey(orgId) })
    },
  })
}

export function costsQueryKey(orgId: string) {
  return ['costs', orgId] as const
}

export function useCosts(orgId: string) {
  return useQuery({
    queryKey: costsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchCosts(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useMarkCostInstantPayout(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cost: ShipmentCost) => markCostInstantPayout(cost.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: costsQueryKey(orgId) })
    },
  })
}
