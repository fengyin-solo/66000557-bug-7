import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Tick, OrderBook, GridConfig, GridResult } from '@/types'
import { normalizeOrderBook } from '@/utils/orderBook'

export const useTradingStore = defineStore('trading', () => {
  const loading = ref(false)
  const ticks = ref<Tick[]>([])
  const orderBook = ref<OrderBook | null>(null)
  const gridResult = ref<GridResult | null>(null)
  const wsConnected = ref(false)
  const config = ref<GridConfig>({ lowerPrice: 95, upperPrice: 115, gridCount: 20, capitalPerGrid: 1000, initialCapital: 100000 })

  let ws: WebSocket | null = null
  let shouldReconnect = false
  let reconnectTimer: number | null = null
  let reconnecting = false

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect || reconnecting || reconnectTimer !== null) return
    reconnecting = true
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      reconnecting = false
      connectWS()
    }, 1000)
  }

  function connectWS() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING || ws?.readyState === WebSocket.CLOSING) return

    shouldReconnect = true
    clearReconnectTimer()
    const socket = new WebSocket(`ws://${location.hostname}:8000/ws`)
    ws = socket

    socket.onopen = () => { wsConnected.value = true }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const snapshot = normalizeOrderBook(data.orderBook)
        if (snapshot) {
          orderBook.value = snapshot
        }
        if (Array.isArray(data.ticks)) {
          ticks.value = data.ticks.slice(-60)
        }
      } catch {
        // Ignore malformed frames and keep the last valid snapshot.
      }
    }
    socket.onclose = () => {
      if (ws === socket) {
        wsConnected.value = false
        ws = null
      }
      scheduleReconnect()
    }
    socket.onerror = () => {
      socket.close()
    }
  }

  async function runBacktest() {
    loading.value = true
    try { const { data } = await axios.post('/api/backtest', config.value) ; gridResult.value = data }
    finally { loading.value = false }
  }

  function disconnectWS() {
    shouldReconnect = false
    clearReconnectTimer()
    reconnecting = false
    if (ws) {
      const socket = ws
      ws = null
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }
    wsConnected.value = false
  }

  return { loading, ticks, orderBook, gridResult, wsConnected, config, connectWS, runBacktest, disconnectWS }
})
