import { useState, useMemo, useCallback, useEffect } from 'react'

export interface OrderBookState {
  shortPrices: number[]
  longPrices: number[]
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

const STORAGE_KEY = 'order-book-state'

const DEFAULT_SHORT = [
  79600, 79500, 79400, 79300, 79200, 79100, 79000, 78900, 78800, 78700, 78600,
  78500, 78400, 78300, 78200, 78100,
]

const DEFAULT_LONG = [
  78000, 77900, 77800, 77700, 77600, 77500, 77400, 77300, 77200, 77100, 77000,
  76900, 76800, 76700, 76600, 76500,
]

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
      return parsed as OrderBookState
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

export function useOrderBook() {
  const [state, setState] = useState<OrderBookState>(() => {
    return loadSaved() ?? { shortPrices: DEFAULT_SHORT, longPrices: DEFAULT_LONG }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const updateShortPrice = useCallback((index: number, value: number) => {
    setState((prev) => {
      const next = [...prev.shortPrices]
      next[index] = value
      return { ...prev, shortPrices: next }
    })
  }, [])

  const updateLongPrice = useCallback((index: number, value: number) => {
    setState((prev) => {
      const next = [...prev.longPrices]
      next[index] = value
      return { ...prev, longPrices: next }
    })
  }, [])

  const addShortPrice = useCallback(() => {
    setState((prev) => {
      const last = prev.shortPrices[prev.shortPrices.length - 1] ?? 0
      return { ...prev, shortPrices: [...prev.shortPrices, last - 100] }
    })
  }, [])

  const addLongPrice = useCallback(() => {
    setState((prev) => {
      const last = prev.longPrices[prev.longPrices.length - 1] ?? 0
      return { ...prev, longPrices: [...prev.longPrices, last - 100] }
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
    const shortList = state.shortPrices
    const longList = state.longPrices

    // F6 = AVERAGE(B4:B35) = average of all SHORT prices
    const avgShort = average(shortList)

    // F15 = AVERAGE(D4:D35) = average of all LONG prices
    const avgLong = average(longList)

    // F3 = AVERAGE(F6, F15) = average of avgShort and avgLong
    const f3 = average([avgShort, avgLong])

    // G2 (PUNTO DE ENTRADA) = AVERAGE(F3, G3, F15, F6)
    //   where G3 = F15 = avgLong
    // = AVERAGE(f3, avgLong, avgLong, avgShort)
    const entryPoint = (f3 + avgLong + avgLong + avgShort) / 4

    // BLOQUE TOPE SHORT = F6 = avgShort
    const bloqueTopeShort = avgShort

    // BLOQUE DE SHORT = F9 = AVERAGE(F3, F15, F6, F6)
    const bloqueDeShort = (f3 + avgLong + avgShort + avgShort) / 4

    // BLOQUE DE LONG = F12 = AVERAGE(F3, F15, F15, F6)
    const bloqueDeLong = (f3 + avgLong + avgLong + avgShort) / 4

    // BLOQUE TOPE LONG = F15 = avgLong
    const bloqueTopeLong = avgLong

    // F30 = B11 (8th SHORT value, index 7)
    // F31 = D11 (8th LONG value, index 7)
    // Use middle element as fallback when list has fewer than 8 items
    const shortIdx = Math.min(7, shortList.length - 1)
    const longIdx = Math.min(7, longList.length - 1)
    const f30 = shortList[shortIdx] ?? avgShort
    const f31 = longList[longIdx] ?? avgLong

    // F28 = AVERAGE(F3, F30, F31)
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
    (shortPrices: number[], longPrices: number[]) => {
      setState({ shortPrices, longPrices })
    },
    [],
  )

  return {
    ...state,
    computed,
    updateShortPrice,
    updateLongPrice,
    addShortPrice,
    addLongPrice,
    removeShortPrice,
    removeLongPrice,
    loadPrices,
  }
}
