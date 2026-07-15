import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveQuoteToggle, fetchQuotes, fetchTariffs, markQuoteConverted, updateQuoteStatus } from '../api/quotes'
import { insertShipment } from '../api/shipments'
import { shipmentsQueryKey } from './useShipments'
import type { Quote, QuoteStatus, ShipmentMode } from '../types'

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

// Composes insertShipment + markQuoteConverted — same accepted two-step shape as before
// (ADR-0006) — and invalidates both the quotes and shipments caches on success.
export function useConvertQuote(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ quote, payload, mode }: { quote: Quote; payload: Record<string, unknown>; mode: ShipmentMode }) => {
      const { data: newShipment, error: insertErr } = await insertShipment(payload, mode)
      if (!newShipment) return { newShipment: null, updatedQuote: null, error: insertErr }
      const { data: updatedQuote, error: updateErr } = await markQuoteConverted(quote.id, newShipment.id)
      if (!updatedQuote) return { newShipment, updatedQuote: null, error: updateErr ?? 'Booking created, but could not update the quote' }
      return { newShipment, updatedQuote, error: null }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotesQueryKey(orgId) })
      void queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(orgId) })
    },
  })
}
