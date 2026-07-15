import { useQuery } from '@tanstack/react-query'
import { fetchReportingData } from '../api/reporting'

export function reportingQueryKey(orgId: string, userId: string | undefined) {
  return ['reporting', orgId, userId ?? null] as const
}

// staleTime: 0 overrides the app-wide default — Reporting's own "Live · as of [time]" badge
// promises a fresh-on-every-load query (ADR-0018), so this screen must not serve a cached
// snapshot the way list screens elsewhere in the app are allowed to.
export function useReportingData(orgId: string, userId: string | undefined) {
  return useQuery({
    queryKey: reportingQueryKey(orgId, userId),
    queryFn: () => fetchReportingData(orgId, userId),
    staleTime: 0,
  })
}
