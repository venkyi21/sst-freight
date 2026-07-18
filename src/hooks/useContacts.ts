import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveContactToggle, fetchContactHistory, fetchContacts } from '../api/contacts'
import type { Contact } from '../types'

export function contactsQueryKey(orgId: string) {
  return ['contacts', orgId] as const
}

export function useContacts(orgId: string) {
  return useQuery({
    queryKey: contactsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await fetchContacts(orgId)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

export function contactHistoryQueryKey(orgId: string, contactId: string) {
  return ['contact-history', orgId, contactId] as const
}

export function useContactHistory(orgId: string, contactId: string | null) {
  return useQuery({
    queryKey: contactHistoryQueryKey(orgId, contactId ?? 'none'),
    enabled: Boolean(contactId),
    queryFn: async () => {
      const { data, error } = await fetchContactHistory(orgId, contactId!)
      if (error) throw new Error(error)
      return data ?? { shipments: [], invoices: [] }
    },
  })
}

export function useArchiveContact(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (contact: Contact) => archiveContactToggle(contact),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactsQueryKey(orgId) })
    },
  })
}
