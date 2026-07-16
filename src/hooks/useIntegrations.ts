import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWebhookEndpoint,
  fetchWebhookEndpoints,
  listApiKeys,
  listWebhookDeliveries,
  revokeApiKey,
  setWebhookEndpointEnabled,
} from '../api/integrations'
import type { WebhookEventType } from '../types/integrations'

export function apiKeysQueryKey(orgId: string) {
  return ['apiKeys', orgId] as const
}

export function webhookEndpointsQueryKey(orgId: string) {
  return ['webhookEndpoints', orgId] as const
}

export function webhookDeliveriesQueryKey(orgId: string, endpointId: string | null) {
  return ['webhookDeliveries', orgId, endpointId] as const
}

export function useApiKeys(orgId: string) {
  return useQuery({
    queryKey: apiKeysQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await listApiKeys(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useRevokeApiKey(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(orgId) })
    },
  })
}

export function useWebhookEndpoints(orgId: string) {
  return useQuery({
    queryKey: webhookEndpointsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchWebhookEndpoints(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function useCreateWebhookEndpoint(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ url, eventTypes, createdBy }: { url: string; eventTypes: WebhookEventType[]; createdBy: string }) =>
      createWebhookEndpoint(orgId, url, eventTypes, createdBy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: webhookEndpointsQueryKey(orgId) })
    },
  })
}

export function useSetWebhookEndpointEnabled(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ endpointId, enabled }: { endpointId: string; enabled: boolean }) =>
      setWebhookEndpointEnabled(endpointId, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: webhookEndpointsQueryKey(orgId) })
    },
  })
}

export function useWebhookDeliveries(orgId: string, endpointId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: webhookDeliveriesQueryKey(orgId, endpointId),
    queryFn: async () => {
      const { data, error } = await listWebhookDeliveries(orgId, endpointId)
      if (error) throw new Error(error)
      return data ?? []
    },
    enabled,
  })
}
