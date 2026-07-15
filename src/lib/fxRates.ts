import { logError } from './errorLogger'

export async function fetchFxRateToInr(currency: string): Promise<number | null> {
  if (currency === 'INR') return 1

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${currency}`)
    if (!response.ok) {
      logError({
        message: `FX rate fetch returned ${response.status}`,
        source: 'external-api',
        context: { api: 'open.er-api.com', currency },
      })
      return null
    }
    const data = await response.json()
    const rate = data?.rates?.INR
    return typeof rate === 'number' ? rate : null
  } catch (err) {
    logError({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      source: 'external-api',
      context: { api: 'open.er-api.com', currency },
    })
    return null
  }
}
