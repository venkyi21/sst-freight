import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEInvoice, generateEInvoice } from '../api/gst'

export function eInvoiceQueryKey(invoiceId: string) {
  return ['eInvoice', invoiceId] as const
}

export function useEInvoice(invoiceId: string) {
  return useQuery({
    queryKey: eInvoiceQueryKey(invoiceId),
    queryFn: () => fetchEInvoice(invoiceId),
  })
}

export function useGenerateEInvoice(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generateEInvoice(invoiceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eInvoiceQueryKey(invoiceId) })
    },
  })
}
