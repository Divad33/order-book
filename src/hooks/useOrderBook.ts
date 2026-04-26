import { useState, useMemo, useCallback, useEffect } from 'react'
import type { PriceLevel } from './useOrderBookFetch'

export interface OrderBookState {
  shortPrices: PriceLevel[]
  longPrices: PriceLevel[]
}

export interface ComputedBlocks {
  avgShort: number
  avgLong: number
  entryPoint: number
  bloqueTopeShort: number
  bloqueDeShort: number
  bloqueDeLong: number
  bloqueTopeLong: number
  entryPoint2: number
}

export interface HistoryEntry {
  timestamp: number
  symbol: string
  entryPoint: number
  avgShort: number
  avgLong: number
  currentPrice: number
}

const STORAGE_KEY = 'order-book-state'
const HISTORY_KEY = 'order-book-history'

const DEFAULT_SHORT: PriceLevel[] = [
  79600, 79500, 79400, 79300, 79200, 79100, 79000, 78900, 78800, 78700, 78600,
  78500, 78400, 78300, 78200, 78100,
].map((p) => ({ price: p, volume: 0 }))

const DEFAULT_LONG: PriceLevel[] = [
  78000, 77900, 77800, 77700, 77600, 77500, 77400, 77300, 77200, 77100, 77000,
  76900, 76800, 76700, 76600, 76500,
].map((p) => ({ price: p, volume: 0 }))

function loadSaved(): OrderBookState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed.shortPrices) &&
      Array.isArray(parsed.longPrices) &&
      parsed.shortPrices.length > 0 &&
      parsed.longPrices.length > 0
    ) {
      // migrate from old format (number[]) to PriceLevel[]
      const short = parsed.shortPrices.map((p: number | PriceLevel) =>
        typeof p === 'number' ? { price: p, volume: 0 } : p,
      )
      const long = parsed.longPrices.map((p: number | PriceLevel) =>
        typeof p === 'number' ? { price: p, volume: 0 } : p,
      )
      return { shortPrices: short, longPrices: long }
    }
  } catch {
    // ignore
  }
  return null
}

function average(nums: number[]): number {
  const valid = nums.filter((n) => !isNaN(n) && isFinite(n))
  if (valid.length === 0) return 0
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-50)))
}

export function useOrderBook() {
  const [state, setState] = useState<OrderBookState>(() => {
    return (
      loadSaved() ?? { shortPrices: DEFAULT_SHORT, longPrices: DEFAULT_LONG }
    )
  })

  const [prevPrices, setPrevPrices] = useState<{
    short: number[]
    long: number[]
  }>({ short: [], long: [] })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const updateShortPrice = useCallback((index: number, value: number) => {
    setState((prev) => {
      const next = [...prev.shortPrices]
      next[index] = { ...next[index], price: value }
      return { ...prev, shortPrices: next }
    })
  }, [])

  const updateLongPrice = useCallback((index: number, value: number) => {
    setState((prev) => {
      const next = [...prev.longPrices]
      next[index] = { ...next[index], price: value }
      return { ...prev, longPrices: next }
    })
  }, [])

  const addShortPrice = useCallback(() => {
    setState((prev) => {
      const last = prev.shortPrices[prev.shortPrices.length - 1]?.price ?? 0
      return {
        ...prev,
        shortPrices: [...prev.shortPrices, { price: last - 100, volume: 0 }],
      }
    })
  }, [])

  const addLongPrice = useCallback(() => {
    setState((prev) => {
      const last = prev.longPrices[prev.longPrices.length - 1]?.price ?? 0
      return {
        ...prev,
        longPrices: [...prev.longPrices, { price: last - 100, volume: 0 }],
      }
    })
  }, [])

  const removeShortPrice = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      shortPrices: prev.shortPrices.filter((_, i) => i !== index),
    }))
  }, [])

  const removeLongPrice = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      longPrices: prev.longPrices.filter((_, i) => i !== index),
    }))
  }, [])

  const computed = useMemo<ComputedBlocks>(() => {
    const shortList = state.shortPrices.map((p) => p.price)
    const longList = state.longPrices.map((p) => p.price)

    const avgShort = average(shortList)
    const avgLong = average(longList)
    const f3 = average([avgShort, avgLong])

    const entryPoint = (f3 + avgLong + avgLong + avgShort) / 4
    const bloqueTopeShort = avgShort
    const bloqueDeShort = (f3 + avgLong + avgShort + avgShort) / 4
    const bloqueDeLong = (f3 + avgLong + avgLong + avgShort) / 4
    const bloqueTopeLong = avgLong

    const shortIdx = Math.min(7, shortList.length - 1)
    const longIdx = Math.min(7, longList.length - 1)
    const f30 = shortList[shortIdx] ?? avgShort
    const f31 = longList[longIdx] ?? avgLong
    const entryPoint2 = (f3 + f30 + f31) / 3

    return {
      avgShort,
      avgLong,
      entryPoint,
      bloqueTopeShort,
      bloqueDeShort,
      bloqueDeLong,
      bloqueTopeLong,
      entryPoint2,
    }
  }, [state.shortPrices, state.longPrices])

  const loadPrices = useCallback(
    (shortPrices: PriceLevel[], longPrices: PriceLevel[]) => {
      setPrevPrices({
        short: state.shortPrices.map((p) => p.price),
        long: state.longPrices.map((p) => p.price),
      })
      setState({ shortPrices, longPrices })
    },
    [state.shortPrices, state.longPrices],
  )

  return {
    ...state,
    computed,
    prevPrices,
    updateShortPrice,
    updateLongPrice,
    addShortPrice,
    addLongPrice,
    removeShortPrice,
    removeLongPrice,
    loadPrices,
  }
}
