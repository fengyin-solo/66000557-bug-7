export interface Tick { time: string; price: number; bid: number; ask: number; volume: number }
export type OrderBookLevel = [number, number]
export interface OrderBook { bids: OrderBookLevel[]; asks: OrderBookLevel[]; midPrice: number; spread: number }
export interface GridConfig { lowerPrice: number; upperPrice: number; gridCount: number; capitalPerGrid: number; initialCapital: number }
export interface GridOrder { id: number; price: number; side: string; quantity: number; status: string; profit: number }
export interface GridResult { orders: GridOrder[]; totalProfit: number; returnRate: number; sharpeRatio: number; maxDrawdown: number; winRate: number; equityCurve: number[] }
