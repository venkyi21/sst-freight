import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveQuoteToggle, convertQuote, fetchQuotes, fetchTariffs, updateQuoteStatus } from '../api/quotes'
import { shipmentsQueryKey } from './useShipments'
import type { Quote, QuoteStatus } from '../types'

export function tariffsQueryKey(orgId: string) {
  return ['tariffs', orgId] as const
}

export function useTariffs(orgId: string) {
  return useQuery({
    queryKey: tariffsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchTariffs(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function quotesQueryKey(orgId: string) {
  return ['quotes', orgId] as const
}

export function useQuotes(orgId: string) {
  return useQuery({
    queryKey: quotesQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchQuotes(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useUpdateQuoteStatus(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ quote, status, reason }: { quote: Quote; status: QuoteStatus; reason?: string }) => updateQuoteStatus(quote.id, status, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotesQueryKey(orgId) })
    },
  })
}

export function useArchiveQuote(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (quote: Quote) => archiveQuoteToggle(quote),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotesQueryKey(orgId) })
    },
  })
}

// One atomic call through the quotes-service tier (ADR-0030) — shipment creation and the
// quote's status flip happen in a single server-side transaction, so the old two-step race
// (ADR-0006) is gone. Invalidates both the quotes and shipments caches on success.
export function useConvertQuote(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quote: Quote) => {
      const { data, error } = await convertQuote(quote.id)
      if (!data) return { newShipment: null, updatedQuote: null, error }
      return { newShipment: data.shipment, updatedQuote: data.quote, error: null }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotesQueryKey(orgId) })
      void queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(orgId) })
    },
  })
}
