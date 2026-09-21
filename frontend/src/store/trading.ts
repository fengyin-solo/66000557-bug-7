import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Tick, OrderBook, GridConfig, GridResult } from '@/types'
export const useTradingStore = defineStore('trading', () => {
  const loading = ref(false)
  const ticks = ref<Tick[]>([])
  const orderBook = ref<OrderBook | null>(null)
  const gridResult = ref<GridResult | null>(null)
  const wsConnected = ref(false)
  const config = ref<GridConfig>({ lowerPrice: 95, upperPrice: 115, gridCount: 20, capitalPerGrid: 1000, initialCapital: 100000 })

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closedManually = false

  function connectWS() {
    closedManually = false
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    ws = new WebSocket(`ws://${location.hostname}:8000/ws`)
    ws.onopen = () => { wsConnected.value = true }
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.ticks) ticks.value = d.ticks.slice(-60)
        if (d.orderBook) orderBook.value = d.orderBook
      } catch {}
    }
    ws.onclose = () => {
      wsConnected.value = false
      ws = null
      // 行情短暂中断后自动重连；恢复后用新快照统一重绘
      if (!closedManually) reconnectTimer = setTimeout(connectWS, 1000)
    }
  }

  async function runBacktest() {
    loading.value = true
    try { const { data } = await axios.post('/api/backtest', config.value) ; gridResult.value = data }
    finally { loading.value = false }
  }

  function disconnectWS() {
    closedManually = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    ws?.close(); ws = null; wsConnected.value = false
  }

  return { loading, ticks, orderBook, gridResult, wsConnected, config, connectWS, runBacktest, disconnectWS }
})
