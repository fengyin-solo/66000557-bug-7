<template>
  <div class="panel"><h4>📊 订单簿深度</h4><canvas ref="cvs" width="360" height="280" class="depth-canvas"></canvas></div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useTradingStore } from '../store/trading'
import type { OrderBook } from '../types'
const store = useTradingStore(); const cvs = ref<HTMLCanvasElement>()

// 画布几何（尺寸保持 360x280 不变）
const W = 360, H = 280, CX = W / 2
const PAD = 6
const ROWS = 10
const TOP = 28
const ROW_H = (H - TOP - PAD) / ROWS
const BAR_MAX = 100

type Level = [number, number]

// 以同一份快照做归一化：过滤无效/空档位、按价格排序、价格去重
function normalizeLevels(raw: unknown, desc: boolean): Level[] {
  if (!Array.isArray(raw)) return []
  const levels: Level[] = []
  for (const item of raw as unknown[]) {
    const pair = item as [number, number] | undefined
    const p = Number(pair?.[0])
    const q = Number(pair?.[1])
    if (!Number.isFinite(p) || !Number.isFinite(q) || q <= 0) continue
    levels.push([p, q])
  }
  levels.sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0]))
  const seen = new Set<number>()
  return levels.filter(([p]) => (seen.has(p) ? false : seen.add(p)))
}

function draw() {
  const c = cvs.value
  if (!c) return
  const ctx = c.getContext('2d')!
  // 每帧先整体清空，避免上一帧的柱/文字残留
  ctx.fillStyle = '#0a0e27'; ctx.fillRect(0, 0, W, H)
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const ob: OrderBook | null = store.orderBook
  if (!ob) return

  // 买卖两侧取自同一份快照，只归一化一次：柱长、数值、中间价、价差全部基于它
  const bids = normalizeLevels(ob.bids, true).slice(0, ROWS)
  const asks = normalizeLevels(ob.asks, false).slice(0, ROWS)

  let maxQty = 1
  for (const lv of [...bids, ...asks]) if (lv[1] > maxQty) maxQty = lv[1]
  // 数量突然放大时柱长按同一比例缩放并夹取，绝不会超出画布
  const widthOf = (q: number) => Math.max(1, Math.min(BAR_MAX, (q / maxQty) * BAR_MAX))

  // 中间价/价差以当前快照的买一/卖一为准，与档位显示同源
  const bestBid = bids.length ? bids[0][0] : NaN
  const bestAsk = asks.length ? asks[0][0] : NaN
  let mid = Number(ob.midPrice)
  let spread = Number(ob.spread)
  if (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) {
    mid = (bestBid + bestAsk) / 2
    spread = bestAsk - bestBid
  }
  ctx.fillStyle = '#e0e0e0'; ctx.textAlign = 'left'
  ctx.fillText(`中间价 ${Number.isFinite(mid) ? mid.toFixed(2) : '--'}`, PAD, 16)
  ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right'
  ctx.fillText(`价差 ${Number.isFinite(spread) ? spread.toFixed(2) : '--'}`, W - PAD, 16)

  ctx.strokeStyle = '#334155'
  ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()

  // 固定 10 行，缺失档位留空，绝不把空白档画成柱子
  for (let i = 0; i < ROWS; i++) {
    const y = TOP + i * ROW_H
    const h = ROW_H - 3
    const textY = y + h - 5

    const b = bids[i]
    if (b) {
      const w = widthOf(b[1])
      ctx.fillStyle = 'rgba(34,197,94,0.6)'
      ctx.fillRect(CX - 4 - w, y, w, h)
      // 价格固定在最左，数量贴在柱尖左侧，文字不越过中线
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.fillText(String(b[1]), CX - 4 - w - 3, textY)
      ctx.textAlign = 'left'
      ctx.fillText(b[0].toFixed(2), PAD, textY)
    }

    const a = asks[i]
    if (a) {
      const w = widthOf(a[1])
      ctx.fillStyle = 'rgba(239,68,68,0.6)'
      ctx.fillRect(CX + 4, y, w, h)
      // 价格固定在最右，数量贴在柱尖右侧
      ctx.fillStyle = '#f87171'
      ctx.textAlign = 'left'
      ctx.fillText(String(a[1]), CX + 4 + w + 3, textY)
      ctx.textAlign = 'right'
      ctx.fillText(a[0].toFixed(2), W - PAD, textY)
    }
  }
  ctx.textAlign = 'left'
}

onMounted(draw) // 返回页面组件重建时，用 store 中最后一份快照立即重绘，样式与数值不回退
watch(() => store.orderBook, draw, { deep: true })
</script>
<style scoped>.panel{background:#0f1535;border-radius:8px;padding:12px;border:1px solid #1e2a5a}.panel h4{color:#4fc3f7;font-size:13px;margin-bottom:8px}.depth-canvas{display:block;margin:0 auto;border-radius:4px}</style>
