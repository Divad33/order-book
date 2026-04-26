import { useState, useMemo, useCallback } from 'react'

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

const DEFAULT_SHORT = [
  79600, 79500, 79400, 79300, 79200, 79100, 79000, 78900, 78800, 78700, 78600,
  78500, 78400, 78300, 78200, 78100,
]

const DEFAULT_LONG = [
  78000, 77900, 77800, 77700, 77600, 77500, 77400, 77300, 77200, 77100, 77000,
  76900, 76800, 76700, 76600, 76500,
]

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function useOrderBook() {
  const [state, setState] = useState<OrderBookState>({
    shortPrices: DEFAULT_SHORT,
    longPrices: DEFAULT_LONG,
  })

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
    const avgShort = average(state.shortPrices)
    const avgLong = average(state.longPrices)

    // F3 = AVERAGE(F6, F15) = AVERAGE(avgShort, avgLong)
    const f3 = average([avgShort, avgLong])

    // G3 = F15 = avgLong
    // G2 = AVERAGE(F3, G3, F15, F6) = AVERAGE(f3, avgLong, avgLong, avgShort)
    const entryPoint = average([f3, avgLong, avgLong, avgShort])

    // BLOQUE TOPE SHORT = F6 = avgShort
    const bloqueTopeShort = avgShort

    // BLOQUE DE SHORT = F9 = AVERAGE(F3, F15, F6, F6) = AVERAGE(f3, avgLong, avgShort, avgShort)
    const bloqueDeShort = average([f3, avgLong, avgShort, avgShort])

    // BLOQUE DE LONG = F12 = AVERAGE(F3, F15, F15, F6) = AVERAGE(f3, avgLong, avgLong, avgShort)
    const bloqueDeLong = average([f3, avgLong, avgLong, avgShort])

    // BLOQUE TOPE LONG = F15 = avgLong
    const bloqueTopeLong = avgLong

    // F30 = B11 (shortPrices index 7, i.e., 8th value)
    const f30 = state.shortPrices[7] ?? 0
    // F31 = D11 (longPrices index 7)
    const f31 = state.longPrices[7] ?? 0
    // F28 = AVERAGE(F3, F30, F31)
    const entryPoint2 = average([f3, f30, f31])

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
