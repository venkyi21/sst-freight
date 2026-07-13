export async function fetchFxRateToInr(currency: string): Promise<number | null> {
  if (currency === 'INR') return 1

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${currency}`)
    if (!response.ok) return null
    const data = await response.json()
    const rate = data?.rates?.INR
    return typeof rate === 'number' ? rate : null
  } catch {
    return null
  }
}
