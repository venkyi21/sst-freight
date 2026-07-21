import { useQuery } from '@tanstack/react-query'
import { fetchReferrals, fetchWalletBalance, fetchWalletTransactions } from '../api/referrals'

export function referralsQueryKey(orgId: string) {
  return ['referrals', orgId] as const
}
export function walletQueryKey(orgId: string) {
  return ['wallet', orgId] as const
}

export function useReferrals(orgId: string | undefined) {
  return useQuery({
    queryKey: referralsQueryKey(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await fetchReferrals(orgId!)
      if (error) throw new Error(error)
      return data ?? []
    },
  })
}

// One query for the whole wallet view: the transaction ledger + the computed balance.
export function useWallet(orgId: string | undefined) {
  return useQuery({
    queryKey: walletQueryKey(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [{ data: txns, error }, balance] = await Promise.all([
        fetchWalletTransactions(orgId!),
        fetchWalletBalance(orgId!),
      ])
      if (error) throw new Error(error)
      return { transactions: txns ?? [], balance }
    },
  })
}
