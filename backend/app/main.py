import asyncio, time, random, math, json, threading
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Grid Trading Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ACTIVE_CLIENTS = []
SIM_RUNNING = True
LOOP = None
current_price = 100.0
ticks_history = []
last_payload = None

class GridConfig(BaseModel):
    lowerPrice: float = 95
    upperPrice: float = 115
    gridCount: int = 20
    capitalPerGrid: float = 1000
    initialCapital: float = 100000


def simulate_market():
    global current_price, ticks_history, last_payload
    price = 100.0
    while SIM_RUNNING:
        drift = 0.005 * math.sin(time.time() * 0.05)
        price += random.gauss(drift, 0.3)
        price = max(80, min(130, price))
        current_price = price
        tick = {
            "time": time.strftime("%H:%M:%S"),
            "price": round(price, 2),
            "bid": round(price - random.uniform(0.01, 0.05), 2),
            "ask": round(price + random.uniform(0.01, 0.05), 2),
            "volume": random.randint(100, 5000)
        }
        ticks_history.append(tick)
        if len(ticks_history) > 200:
            ticks_history = ticks_history[-200:]

        # Order book —— 整份快照只构建一次：档位、中间价、价差全部同源。
        # 价格用整数分（整数 tick 偏移）生成，避免浮点 round 产生重复价/错位档。
        price_cents = round(price * 100)
        bids = [[(price_cents - i) / 100, random.randint(100, 1000)] for i in range(1, 11)]
        asks = [[(price_cents + i) / 100, random.randint(100, 1000)] for i in range(1, 11)]
        best_bid, best_ask = bids[0][0], asks[0][0]
        order_book = {
            "bids": bids,
            "asks": asks,
            "midPrice": round((best_bid + best_ask) / 2, 2),
            "spread": round(best_ask - best_bid, 2),
        }

        payload = json.dumps({"ticks": ticks_history[-60:], "orderBook": order_book})
        last_payload = payload
        # 模拟器运行在独立线程，必须复用启动时捕获的主事件循环向 WS 推送
        if LOOP is not None:
            dead = []
            for client in ACTIVE_CLIENTS:
                try:
                    asyncio.run_coroutine_threadsafe(client.send_text(payload), LOOP)
                except Exception:
                    dead.append(client)
            for client in dead:
                if client in ACTIVE_CLIENTS:
                    ACTIVE_CLIENTS.remove(client)
        time.sleep(0.5)


@app.on_event("startup")
async def startup():
    global LOOP
    LOOP = asyncio.get_running_loop()
    threading.Thread(target=simulate_market, daemon=True).start()


@app.post("/api/backtest")
def run_backtest(config: GridConfig):
    step = (config.upperPrice - config.lowerPrice) / config.gridCount
    grid_prices = [config.lowerPrice + i * step for i in range(config.gridCount + 1)]

    # Simulate prices
    np.random.seed(42)
    prices = [100]
    for _ in range(200):
        prices.append(prices[-1] + random.gauss(0, 1.2))
    prices = [max(70, min(140, p)) for p in prices]

    buy_grids = {}  # price -> True (buy order placed)
    orders = []
    cash = config.initialCapital
    holdings = 0
    equity_curve = [cash]
    order_id = 0

    for p in prices:
        for gp in grid_prices:
            # Buy signal
            if p <= gp and gp not in buy_grids and cash >= config.capitalPerGrid:
                qty = config.capitalPerGrid / gp
                cash -= config.capitalPerGrid
                holdings += qty
                buy_grids[gp] = True
                order_id += 1
                orders.append({"id": order_id, "price": round(gp, 2), "side": "BUY", "quantity": round(qty, 2), "status": "FILLED", "profit": 0})

            # Sell signal
            upper_gp = gp + step * 0.5
            if p >= upper_gp and gp in buy_grids:
                qty = config.capitalPerGrid / gp
                buy_price = gp
                sell_price = gp + step * 0.5
                profit = qty * (sell_price - buy_price)
                cash += config.capitalPerGrid + profit
                holdings -= qty
                del buy_grids[gp]
                order_id += 1
                orders.append({"id": order_id, "price": round(sell_price, 2), "side": "SELL", "quantity": round(qty, 2), "status": "FILLED", "profit": round(profit, 2)})

        equity = cash + holdings * p
        equity_curve.append(round(equity, 2))

    total_profit = cash + holdings * prices[-1] - config.initialCapital
    return_rate = (total_profit / config.initialCapital) * 100

    # Sharpe ratio
    eq_returns = np.diff(equity_curve) / np.array(equity_curve[:-1] + 1e-5)
    sharpe = float(np.mean(eq_returns) / max(np.std(eq_returns), 1e-5) * np.sqrt(252)) if len(eq_returns) > 1 else 0

    # Max drawdown
    peak = equity_curve[0]
    max_dd = 0.0
    for e in equity_curve:
        if e > peak: peak = e
        dd = (peak - e) / peak * 100
        max_dd = max(max_dd, dd)

    # Win rate
    wins = sum(1 for o in orders if o["profit"] > 0)
    total = len([o for o in orders if o["side"] == "SELL"])
    win_rate = (wins / total * 100) if total > 0 else 0

    return {
        "orders": orders,
        "totalProfit": round(total_profit, 2),
        "returnRate": round(return_rate, 2),
        "sharpeRatio": round(sharpe, 2),
        "maxDrawdown": round(max_dd, 2),
        "winRate": round(win_rate, 1),
        "equityCurve": equity_curve
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    ACTIVE_CLIENTS.append(ws)
    # 中断后重连立即补发最新快照，避免客户端停留在上一帧
    if last_payload is not None:
        try:
            await ws.send_text(last_payload)
        except Exception:
            if ws in ACTIVE_CLIENTS:
                ACTIVE_CLIENTS.remove(ws)
            return
    try:
        while True:
            await ws.receive_text()
    except Exception:
        if ws in ACTIVE_CLIENTS:
            ACTIVE_CLIENTS.remove(ws)