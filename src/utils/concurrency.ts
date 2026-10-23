/**
 * Map over items with a bounded number of concurrent async operations.
 *
 * Prevents burst fan-out (e.g. hundreds of simultaneous forecast fetches) that
 * can trip upstream rate limits. Results preserve input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) break
      results[i] = await fn(items[i], i)
    }
  })

  await Promise.all(workers)
  return results
}
