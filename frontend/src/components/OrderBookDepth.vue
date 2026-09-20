<template>
  <div class="panel"><h4>📊 订单簿深度</h4><canvas ref="cvs" width="360" height="280" class="depth-canvas"></canvas></div>
</template>
<script setup lang="ts">
import { onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTradingStore } from '../store/trading'

const store = useTradingStore()
const cvs = ref<HTMLCanvasElement>()

const DEPTH = 10
const CENTER_X = 180
const HEADER_HEIGHT = 28
const ROW_HEIGHT = 24
const BAR_HEIGHT = 22
const BID_BAR_RIGHT = 174
const ASK_BAR_LEFT = 186
const MAX_BAR_WIDTH = 134

function formatPrice(value: number): string {
  return Number(value.toFixed(8)).toString()
}

function barWidth(quantity: number, scale: number): number {
  return Math.max(1, quantity * scale)
}

function draw() {
  const canvas = cvs.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0a0e27'
  ctx.fillRect(0, 0, W, H)

  const snapshot = store.orderBook
  if (!snapshot) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('等待盘口数据…', W / 2, H / 2)
    ctx.textAlign = 'left'
    return
  }

  const { bids, asks, midPrice, spread } = snapshot
  const maxQuantity = Math.max(...bids.map(level => level[1]), ...asks.map(level => level[1]), 1)
  const scale = MAX_BAR_WIDTH / maxQuantity

  ctx.font = '11px monospace'
  ctx.fillStyle = '#4fc3f7'
  ctx.textAlign = 'left'
  ctx.fillText(`中间价 ${formatPrice(midPrice)}`, 8, 14)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'right'
  ctx.fillText(`价差 ${formatPrice(spread)}`, W - 8, 14)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#334155'
  ctx.beginPath()
  ctx.moveTo(CENTER_X, HEADER_HEIGHT)
  ctx.lineTo(CENTER_X, H)
  ctx.stroke()

  ctx.font = '10px monospace'
  for (let i = 0; i < DEPTH; i += 1) {
    const y = HEADER_HEIGHT + 6 + i * ROW_HEIGHT
    const bid = bids[i]
    const ask = asks[i]

    if (bid) {
      const [price, quantity] = bid
      const width = barWidth(quantity, scale)
      ctx.fillStyle = 'rgba(34,197,94,0.6)'
      ctx.fillRect(BID_BAR_RIGHT - width, y, width, BAR_HEIGHT)

      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'left'
      ctx.fillText(String(quantity), 4, y + BAR_HEIGHT / 2)
      ctx.textAlign = 'right'
      ctx.fillText(formatPrice(price), 172, y + BAR_HEIGHT / 2)
      ctx.textAlign = 'left'
    }

    if (ask) {
      const [price, quantity] = ask
      const width = barWidth(quantity, scale)
      ctx.fillStyle = 'rgba(239,68,68,0.6)'
      ctx.fillRect(ASK_BAR_LEFT, y, width, BAR_HEIGHT)

      ctx.fillStyle = '#f87171'
      ctx.textAlign = 'left'
      ctx.fillText(formatPrice(price), 188, y + BAR_HEIGHT / 2)
      ctx.textAlign = 'right'
      ctx.fillText(String(quantity), W - 4, y + BAR_HEIGHT / 2)
      ctx.textAlign = 'left'
    }
  }
}

function handlePageShow() {
  draw()
}

onMounted(() => {
  draw()
  window.addEventListener('pageshow', handlePageShow)
})
onActivated(draw)
onUnmounted(() => window.removeEventListener('pageshow', handlePageShow))
watch(() => store.orderBook, draw)
</script>
<style scoped>.panel{background:#0f1535;border-radius:8px;padding:12px;border:1px solid #1e2a5a}.panel h4{color:#4fc3f7;font-size:13px;margin-bottom:8px}.depth-canvas{display:block;margin:0 auto;border-radius:4px}</style>
