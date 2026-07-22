import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { disconnectZoho, fetchZohoSync, getZohoConnectUrl, isZohoConnected, syncInvoiceToZoho } from '../api/zoho'

export function zohoConnectedQueryKey(orgId: string) {
  return ['zohoConnected', orgId] as const
}
export function zohoSyncQueryKey(invoiceId: string) {
  return ['zohoSync', invoiceId] as const
}

export function useZohoConnected(orgId: string) {
  return useQuery({
    queryKey: zohoConnectedQueryKey(orgId),
    queryFn: () => isZohoConnected(orgId),
  })
}

export function useDisconnectZoho(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => disconnectZoho(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zohoConnectedQueryKey(orgId) })
    },
  })
}

export function useZohoConnectUrl() {
  return useMutation({
    mutationFn: (orgId: string) => getZohoConnectUrl(orgId),
  })
}

export function useZohoSync(invoiceId: string) {
  return useQuery({
    queryKey: zohoSyncQueryKey(invoiceId),
    queryFn: () => fetchZohoSync(invoiceId),
  })
}

export function useSyncInvoiceToZoho(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncInvoiceToZoho(invoiceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zohoSyncQueryKey(invoiceId) })
    },
  })
}
