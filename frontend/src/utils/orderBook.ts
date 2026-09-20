import type { OrderBook, OrderBookLevel } from '@/types'

type RawLevel = [unknown, unknown] | readonly [unknown, unknown]
type RawOrderBook = {
  bids?: unknown
  asks?: unknown
  midPrice?: unknown
  spread?: unknown
}

// Turn every incoming frame into one immutable, ordered snapshot that the canvas can draw from.

const MAX_DEPTH = 10

function toPositiveNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeLevel(level: RawLevel): OrderBookLevel | null {
  const price = toPositiveNumber(level[0])
  const quantity = toPositiveNumber(level[1])
  return price > 0 && quantity > 0 ? [price, quantity] : null
}

function normalizeSide(levels: unknown, descending: boolean): OrderBookLevel[] {
  if (!Array.isArray(levels)) return []

  const byPrice = new Map<number, number>()

  for (const rawLevel of levels as RawLevel[]) {
    if (!Array.isArray(rawLevel)) continue
    const level = normalizeLevel(rawLevel)
    if (!level) continue

    const [price, quantity] = level
    byPrice.set(price, (byPrice.get(price) ?? 0) + quantity)
  }

  return Array.from(byPrice, ([price, quantity]) => [price, quantity] as OrderBookLevel)
    .sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]))
    .slice(0, MAX_DEPTH)
}

export function normalizeOrderBook(snapshot: RawOrderBook | null | undefined): OrderBook | null {
  if (!snapshot || !Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) {
    return null
  }

  const bids = normalizeSide(snapshot.bids, true)
  const asks = normalizeSide(snapshot.asks, false)
  const bestBid = bids[0]?.[0]
  const bestAsk = asks[0]?.[0]

  if (bids.length === 0 && asks.length === 0) {
    return null
  }

  const fallbackMidPrice = Number(snapshot.midPrice)
  const midPrice = bestBid !== undefined && bestAsk !== undefined
    ? (bestBid + bestAsk) / 2
    : Number.isFinite(fallbackMidPrice)
      ? fallbackMidPrice
      : bestBid ?? bestAsk ?? 0
  const spread = bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : 0

  return { bids, asks, midPrice, spread }
}
