import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveContactToggle, fetchContacts } from '../api/contacts'
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

export function useArchiveContact(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (contact: Contact) => archiveContactToggle(contact),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactsQueryKey(orgId) })
    },
  })
}
