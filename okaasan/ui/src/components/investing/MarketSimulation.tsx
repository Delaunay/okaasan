import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Grid, Badge, Button, Input, Table,
} from '@chakra-ui/react';
import { ArrowLeft, Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';

const cardBg = 'var(--card-bg, #1a1a2e)';
const headingColor = 'var(--heading-color, #e0e0e0)';

function Card({ children, ...props }: { children: React.ReactNode } & Record<string, any>) {
  return (
    <Box bg={cardBg} borderRadius="lg" p={4} border="1px solid" borderColor="whiteAlpha.100" {...props}>
      {children}
    </Box>
  );
}

function NumInput({ label, value, onChange, step, min, max, width = '90px' }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; width?: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(value)); }, [value, focused]);
  const commit = (s: string) => { const n = Number(s); if (!isNaN(n)) onChange(n); else setDraft(String(value)); };
  return (
    <VStack gap={0} align="start">
      <Text fontSize="xs" color="gray.400">{label}</Text>
      <Input type="number" size="sm" width={width}
        value={focused ? draft : value} step={step} min={min} max={max}
        onFocus={() => setFocused(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => { setFocused(false); commit(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') commit(draft); }}
      />
    </VStack>
  );
}

// =========================================================================
// Simulation Engine
// =========================================================================

type OrderSide = 'buy' | 'sell';
type OrderType = 'limit' | 'market' | 'stop';

interface Order {
  id: number;
  side: OrderSide;
  type: OrderType;
  price: number;
  qty: number;
  agentId: string;
  timestamp: number;
}

interface Fill {
  price: number;
  qty: number;
  buyAgentId: string;
  sellAgentId: string;
  timestamp: number;
}

interface BookLevel {
  price: number;
  qty: number;
  count: number;
}

function roundPrice(p: number): number {
  return Math.round(p * 100) / 100;
}

// ---------------------------------------------------------------------------
// Order Book with price-time priority matching
// ---------------------------------------------------------------------------
class OrderBook {
  bids: Order[] = [];     // sorted desc by price, then asc by timestamp
  asks: Order[] = [];     // sorted asc by price, then asc by timestamp
  stops: Order[] = [];
  fills: Fill[] = [];
  lastPrice: number;
  nextId = 1;

  constructor(initialPrice: number) {
    this.lastPrice = initialPrice;
  }

  clone(): OrderBook {
    const ob = new OrderBook(this.lastPrice);
    ob.bids = this.bids.map(o => ({ ...o }));
    ob.asks = this.asks.map(o => ({ ...o }));
    ob.stops = this.stops.map(o => ({ ...o }));
    ob.fills = [...this.fills];
    ob.nextId = this.nextId;
    return ob;
  }

  submit(side: OrderSide, type: OrderType, price: number, qty: number, agentId: string, timestamp: number): void {
    if (qty <= 0) return;
    const order: Order = { id: this.nextId++, side, type, price: roundPrice(price), qty, agentId, timestamp };

    if (type === 'stop') {
      this.stops.push(order);
      return;
    }

    if (type === 'market') {
      this.matchMarket(order);
      return;
    }

    // Limit order — try to match, then rest
    this.matchLimit(order);
  }

  private matchMarket(order: Order): void {
    const book = order.side === 'buy' ? this.asks : this.bids;
    let remaining = order.qty;

    while (remaining > 0 && book.length > 0) {
      const best = book[0];
      const fillQty = Math.min(remaining, best.qty);
      const fillPrice = best.price;

      this.fills.push({
        price: fillPrice, qty: fillQty,
        buyAgentId: order.side === 'buy' ? order.agentId : best.agentId,
        sellAgentId: order.side === 'sell' ? order.agentId : best.agentId,
        timestamp: order.timestamp,
      });
      this.lastPrice = fillPrice;

      remaining -= fillQty;
      best.qty -= fillQty;
      if (best.qty <= 0) book.shift();
    }

    this.triggerStops();
  }

  private matchLimit(order: Order): void {
    const book = order.side === 'buy' ? this.asks : this.bids;
    let remaining = order.qty;

    while (remaining > 0 && book.length > 0) {
      const best = book[0];
      const canFill = order.side === 'buy'
        ? order.price >= best.price
        : order.price <= best.price;
      if (!canFill) break;

      const fillQty = Math.min(remaining, best.qty);
      const fillPrice = best.price;

      this.fills.push({
        price: fillPrice, qty: fillQty,
        buyAgentId: order.side === 'buy' ? order.agentId : best.agentId,
        sellAgentId: order.side === 'sell' ? order.agentId : best.agentId,
        timestamp: order.timestamp,
      });
      this.lastPrice = fillPrice;

      remaining -= fillQty;
      best.qty -= fillQty;
      if (best.qty <= 0) book.shift();
    }

    if (remaining > 0) {
      const resting = { ...order, qty: remaining };
      if (order.side === 'buy') {
        this.bids.push(resting);
        this.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
      } else {
        this.asks.push(resting);
        this.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
      }
    }

    this.triggerStops();
  }

  private triggerStops(): void {
    const triggered: Order[] = [];
    this.stops = this.stops.filter(s => {
      // Stop buy triggers when price >= stop price (breakout)
      // Stop sell triggers when price <= stop price (stop loss)
      const fire = s.side === 'buy'
        ? this.lastPrice >= s.price
        : this.lastPrice <= s.price;
      if (fire) triggered.push(s);
      return !fire;
    });
    for (const s of triggered) {
      this.matchMarket({ ...s, type: 'market' });
    }
  }

  bestBid(): number | null { return this.bids.length > 0 ? this.bids[0].price : null; }
  bestAsk(): number | null { return this.asks.length > 0 ? this.asks[0].price : null; }
  midPrice(): number {
    const b = this.bestBid(), a = this.bestAsk();
    if (b !== null && a !== null) return (b + a) / 2;
    return this.lastPrice;
  }
  spread(): number {
    const b = this.bestBid(), a = this.bestAsk();
    if (b !== null && a !== null) return a - b;
    return 0;
  }

  topBids(n: number): BookLevel[] { return this.aggregate(this.bids, n); }
  topAsks(n: number): BookLevel[] { return this.aggregate(this.asks, n); }

  private aggregate(orders: Order[], n: number): BookLevel[] {
    const levels: BookLevel[] = [];
    for (const o of orders) {
      if (levels.length > 0 && Math.abs(levels[levels.length - 1].price - o.price) < 0.005) {
        levels[levels.length - 1].qty += o.qty;
        levels[levels.length - 1].count++;
      } else {
        levels.push({ price: o.price, qty: o.qty, count: 1 });
      }
      if (levels.length >= n) break;
    }
    return levels;
  }

  // Clean up stale orders older than maxAge ticks
  expireOrders(currentTick: number, maxAge: number): void {
    this.bids = this.bids.filter(o => currentTick - o.timestamp < maxAge);
    this.asks = this.asks.filter(o => currentTick - o.timestamp < maxAge);
    this.stops = this.stops.filter(o => currentTick - o.timestamp < maxAge);
  }
}

// ---------------------------------------------------------------------------
// Agent base
// ---------------------------------------------------------------------------
interface AgentState {
  id: string;
  type: 'mm' | 'retail' | 'institution';
  cash: number;
  shares: number;
  pnl: number;
  expectedPrice: number;
  initialCash: number;
  initialShares: number;
  spreadIncome: number;
  avgCost: number;        // weighted average cost basis for long inventory
  totalCostBasis: number; // running sum: shares × price at acquisition
}

function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Market Maker — posts two-sided quotes (liquidity provider)
// Runs FIRST each tick so retail/institutions can trade against MM quotes.
// ---------------------------------------------------------------------------
function mmAct(
  state: AgentState,
  book: OrderBook,
  tick: number,
  config: SimConfig,
): void {
  const mid = book.midPrice();
  const halfSpread = config.mmSpread / 2;
  const baseQty = config.mmQty;
  const invLimit = baseQty * 5;

  // Inventory skew: shift quotes to encourage fills that reduce position
  const invRatio = state.shares / (invLimit || 1);
  const skew = halfSpread * 0.6 * Math.max(-1, Math.min(1, invRatio));

  // Scale down the side that would increase exposure
  const bidScale = Math.max(0.1, 1 - Math.max(0, invRatio));
  const askScale = Math.max(0.1, 1 + Math.min(0, invRatio));
  const bidQty = Math.max(1, Math.round(baseQty * bidScale));
  const askQty = Math.max(1, Math.round(baseQty * askScale));

  // Always quote both sides — this is the core MM obligation
  const rawBid = roundPrice(mid - halfSpread - skew);
  let rawAsk = roundPrice(mid + halfSpread - skew);

  // If MM holds long inventory, never sell below avg cost + minimum edge
  if (state.shares > 0 && state.avgCost > 0) {
    const minAsk = roundPrice(state.avgCost + config.mmSpread * 0.5);
    rawAsk = Math.max(rawAsk, minAsk);
  }

  if (state.shares < invLimit) {
    book.submit('buy', 'limit', rawBid, bidQty, state.id, tick);
  }
  if (state.shares > -invLimit) {
    book.submit('sell', 'limit', rawAsk, askQty, state.id, tick);
  }

  // Aggressive inventory unwind if over limit — still respects cost basis
  if (Math.abs(state.shares) > invLimit) {
    if (state.shares > 0) {
      const floorPrice = state.avgCost > 0 ? roundPrice(state.avgCost + 0.01) : 0;
      const sellPrice = Math.max(floorPrice, roundPrice(mid - halfSpread * 0.5));
      book.submit('sell', 'limit', sellPrice, Math.min(state.shares, baseQty), state.id, tick);
    } else {
      book.submit('buy', 'market', 0, Math.min(-state.shares, baseQty), state.id, tick);
    }
  }
}

// ---------------------------------------------------------------------------
// Retail agent — trades daily, uses market orders to hit MM quotes
// ---------------------------------------------------------------------------
function retailAct(
  state: AgentState,
  book: OrderBook,
  tick: number,
  config: SimConfig,
): void {
  const mid = book.midPrice();
  const target = state.expectedPrice;
  const qty = Math.max(1, Math.round(config.retailQty * (0.5 + Math.random())));
  const maxPos = config.retailQty * 5;
  const tolerance = config.retailTolerance / 100;

  // How far off is mid from their target (as fraction)
  const mispricing = (target - mid) / mid;

  if (mispricing > tolerance && state.shares < maxPos) {
    const buyQty = Math.min(qty, maxPos - state.shares);
    if (buyQty > 0) {
      if (Math.abs(mispricing) > tolerance * 2 || Math.random() < 0.4) {
        book.submit('buy', 'market', 0, buyQty, state.id, tick);
      } else {
        const limitPrice = roundPrice(mid + mid * mispricing * (0.3 + Math.random() * 0.3));
        book.submit('buy', 'limit', limitPrice, buyQty, state.id, tick);
      }
      const stopPrice = roundPrice(mid * (1 - config.retailStopPct / 100));
      book.submit('sell', 'stop', stopPrice, buyQty, state.id, tick);
    }
  } else if (mispricing < -tolerance && state.shares > -maxPos) {
    const sellQty = Math.min(qty, maxPos + state.shares);
    if (sellQty > 0) {
      if (Math.abs(mispricing) > tolerance * 2 || Math.random() < 0.4) {
        book.submit('sell', 'market', 0, sellQty, state.id, tick);
      } else {
        const limitPrice = roundPrice(mid + mid * mispricing * (0.3 + Math.random() * 0.3));
        book.submit('sell', 'limit', limitPrice, sellQty, state.id, tick);
      }
      const stopPrice = roundPrice(mid * (1 + config.retailStopPct / 100));
      book.submit('buy', 'stop', stopPrice, sellQty, state.id, tick);
    }
  }
}

// ---------------------------------------------------------------------------
// Institution agent — trades weekly, uses mix of limit and market orders
// ---------------------------------------------------------------------------
function institutionAct(
  state: AgentState,
  book: OrderBook,
  tick: number,
  config: SimConfig,
): void {
  if (tick % 5 !== 0) return;

  const mid = book.midPrice();
  const target = state.expectedPrice;
  const totalQty = Math.max(10, Math.round(config.instQty * (0.5 + Math.random())));
  const maxPos = config.instQty * 5;
  const tolerance = config.instTolerance / 100;
  const mispricing = (target - mid) / mid;

  if (mispricing > tolerance && state.shares < maxPos) {
    const buyQty = Math.min(totalQty, maxPos - state.shares);
    if (buyQty > 0) {
      // Institutions slice orders but still cross the spread
      const slices = Math.min(4, Math.ceil(buyQty / 50));
      const sliceQty = Math.ceil(buyQty / slices);
      for (let i = 0; i < slices; i++) {
        if (Math.random() < 0.5) {
          book.submit('buy', 'market', 0, sliceQty, state.id, tick);
        } else {
          const limitPrice = roundPrice(mid + mid * mispricing * (0.2 + i * 0.1));
          book.submit('buy', 'limit', limitPrice, sliceQty, state.id, tick);
        }
      }
      book.submit('sell', 'stop', roundPrice(mid * (1 - config.instStopPct / 100)), buyQty, state.id, tick);
    }
  } else if (mispricing < -tolerance && state.shares > -maxPos) {
    const sellQty = Math.min(totalQty, maxPos + state.shares);
    if (sellQty > 0) {
      const slices = Math.min(4, Math.ceil(sellQty / 50));
      const sliceQty = Math.ceil(sellQty / slices);
      for (let i = 0; i < slices; i++) {
        if (Math.random() < 0.5) {
          book.submit('sell', 'market', 0, sliceQty, state.id, tick);
        } else {
          const limitPrice = roundPrice(mid - mid * Math.abs(mispricing) * (0.2 + i * 0.1));
          book.submit('sell', 'limit', limitPrice, sliceQty, state.id, tick);
        }
      }
      book.submit('buy', 'stop', roundPrice(mid * (1 + config.instStopPct / 100)), sellQty, state.id, tick);
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation config & state
// ---------------------------------------------------------------------------
interface SimConfig {
  initialPrice: number;
  // Real value process
  realValueMean: number;
  realValueStdDev: number;
  quarterLength: number;
  // Market Maker
  mmCount: number;
  mmSpread: number;
  mmQty: number;
  // Retail
  retailCount: number;
  retailStdDev: number;
  retailQty: number;
  retailStopPct: number;
  retailTolerance: number;   // % band around estimate where price is "fair"
  // Institution
  instCount: number;
  instStdDev: number;
  instQty: number;
  instStopPct: number;
  instTolerance: number;     // % band around estimate where price is "fair"
  // Sim
  ticksPerStep: number;
  orderExpiry: number;
}

const DEFAULT_CONFIG: SimConfig = {
  initialPrice: 100,
  realValueMean: 100,
  realValueStdDev: 10,
  quarterLength: 90,
  mmCount: 3,
  mmSpread: 0.10,
  mmQty: 50,
  retailCount: 50,
  retailStdDev: 8,
  retailQty: 10,
  retailStopPct: 3,
  retailTolerance: 2,
  instCount: 5,
  instStdDev: 3,
  instQty: 200,
  instStopPct: 5,
  instTolerance: 1,
  ticksPerStep: 1,
  orderExpiry: 30,
};

interface Snapshot {
  tick: number;
  price: number;
  realValue: number;
  bid: number | null;
  ask: number | null;
  spread: number;
  volume: number;
  bidDepth: number;
  askDepth: number;
  mmPnl: number;
  retailPnl: number;
  instPnl: number;
  mmSpreadIncome: number;
}

function sampleRealValue(config: SimConfig): number {
  return Math.max(1, config.realValueMean + boxMuller() * config.realValueStdDev);
}

function initAgents(config: SimConfig, realValue: number): AgentState[] {
  const agents: AgentState[] = [];
  const mmCash = 1_000_000, mmShares = 0;
  const retCash = 10_000, retShares = 0;
  const instCash = 5_000_000, instShares = 0;
  for (let i = 0; i < config.mmCount; i++) {
    agents.push({ id: `mm-${i}`, type: 'mm', cash: mmCash, shares: mmShares, pnl: 0,
      expectedPrice: realValue, initialCash: mmCash, initialShares: mmShares, spreadIncome: 0,
      avgCost: 0, totalCostBasis: 0 });
  }
  for (let i = 0; i < config.retailCount; i++) {
    const exp = Math.max(1, realValue + boxMuller() * config.retailStdDev);
    agents.push({ id: `ret-${i}`, type: 'retail', cash: retCash, shares: retShares, pnl: 0,
      expectedPrice: exp, initialCash: retCash, initialShares: retShares, spreadIncome: 0,
      avgCost: 0, totalCostBasis: 0 });
  }
  for (let i = 0; i < config.instCount; i++) {
    const exp = Math.max(1, realValue + boxMuller() * config.instStdDev);
    agents.push({ id: `inst-${i}`, type: 'institution', cash: instCash, shares: instShares, pnl: 0,
      expectedPrice: exp, initialCash: instCash, initialShares: instShares, spreadIncome: 0,
      avgCost: 0, totalCostBasis: 0 });
  }
  return agents;
}

function refreshExpectations(agents: AgentState[], realValue: number, config: SimConfig): void {
  for (const a of agents) {
    if (a.type === 'retail') {
      a.expectedPrice = Math.max(1, realValue + boxMuller() * config.retailStdDev);
    } else if (a.type === 'institution') {
      a.expectedPrice = Math.max(1, realValue + boxMuller() * config.instStdDev);
    }
  }
}

function simulateStep(
  book: OrderBook,
  agents: AgentState[],
  tick: number,
  config: SimConfig,
  realValueRef: { value: number },
): Snapshot {
  // Resample real value every quarter
  if (tick > 0 && tick % config.quarterLength === 0) {
    realValueRef.value = sampleRealValue(config);
    refreshExpectations(agents, realValueRef.value, config);
  }

  const prevFills = book.fills.length;

  // Phase 1: MMs post two-sided quotes (provide liquidity)
  for (const a of agents) {
    if (a.type === 'mm') mmAct(a, book, tick, config);
  }

  // Phase 2: Retail & institutions send orders that hit MM quotes (take liquidity)
  for (const a of agents) {
    if (a.type === 'retail') retailAct(a, book, tick, config);
    else if (a.type === 'institution') institutionAct(a, book, tick, config);
  }

  // Build agent lookup for fast fill processing
  const agentMap = new Map<string, AgentState>();
  for (const a of agents) agentMap.set(a.id, a);

  const mid = book.midPrice();

  for (let f = prevFills; f < book.fills.length; f++) {
    const fill = book.fills[f];
    const buyer = agentMap.get(fill.buyAgentId);
    const seller = agentMap.get(fill.sellAgentId);

    if (buyer) {
      buyer.cash -= fill.price * fill.qty;
      // Update avg cost: buying adds to cost basis
      if (buyer.shares >= 0) {
        buyer.totalCostBasis += fill.price * fill.qty;
      } else {
        // Covering a short: reduce cost basis
        const covered = Math.min(fill.qty, -buyer.shares);
        const newLong = fill.qty - covered;
        buyer.totalCostBasis = newLong > 0 ? fill.price * newLong : 0;
      }
      buyer.shares += fill.qty;
      buyer.avgCost = buyer.shares > 0 ? buyer.totalCostBasis / buyer.shares : 0;
    }

    if (seller) {
      seller.cash += fill.price * fill.qty;
      // Selling reduces inventory; if going short, reset cost basis
      if (seller.shares > 0) {
        const sold = Math.min(fill.qty, seller.shares);
        const shortNew = fill.qty - sold;
        seller.totalCostBasis -= seller.avgCost * sold;
        if (shortNew > 0) seller.totalCostBasis = 0;
      }
      seller.shares -= fill.qty;
      seller.avgCost = seller.shares > 0 ? Math.max(0, seller.totalCostBasis / seller.shares) : 0;
    }

    // Track MM spread income: MM earns when they buy below mid or sell above mid
    if (buyer?.type === 'mm') {
      buyer.spreadIncome += (mid - fill.price) * fill.qty;
    }
    if (seller?.type === 'mm') {
      seller.spreadIncome += (fill.price - mid) * fill.qty;
    }
  }

  book.expireOrders(tick, config.orderExpiry);

  const volume = book.fills.slice(prevFills).reduce((s, f) => s + f.qty, 0);

  // Compute P&L per agent type: (current portfolio value) - (initial portfolio value)
  const price = book.lastPrice;
  let mmPnl = 0, retailPnl = 0, instPnl = 0, mmSpreadIncome = 0;
  for (const a of agents) {
    const currentVal = a.cash + a.shares * price;
    const initialVal = a.initialCash + a.initialShares * config.initialPrice;
    const pnl = currentVal - initialVal;
    if (a.type === 'mm') { mmPnl += pnl; mmSpreadIncome += a.spreadIncome; }
    else if (a.type === 'retail') retailPnl += pnl;
    else instPnl += pnl;
  }

  return {
    tick,
    price,
    realValue: realValueRef.value,
    bid: book.bestBid(),
    ask: book.bestAsk(),
    spread: book.spread(),
    volume,
    bidDepth: book.bids.reduce((s, o) => s + o.qty, 0),
    askDepth: book.asks.reduce((s, o) => s + o.qty, 0),
    mmPnl, retailPnl, instPnl, mmSpreadIncome,
  };
}

// =========================================================================
// UI Components
// =========================================================================

function ConfigPanel({ config, setConfig }: { config: SimConfig; setConfig: (c: SimConfig) => void }) {
  const set = (key: keyof SimConfig, v: number) => setConfig({ ...config, [key]: v });

  return (
    <Card>
      <Heading size="xs" color={headingColor} mb={3}>Simulation Parameters</Heading>
      <Text fontSize="xs" color="gray.400" mb={3}>
        1 tick = 1 day. Real value resamples every quarter ({config.quarterLength} days).
        Retail trades daily, institutions trade weekly (every 5 days).
      </Text>
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr 1fr' }} gap={4}>
        <Box>
          <Text fontSize="sm" fontWeight="bold" color="yellow.300" mb={2}>Real Value (hidden)</Text>
          <Flex gap={2} wrap="wrap">
            <NumInput label="Mean ($)" value={config.realValueMean} onChange={v => set('realValueMean', v)} min={1} step={10} />
            <NumInput label="Std Dev ($)" value={config.realValueStdDev} onChange={v => set('realValueStdDev', v)} min={0.5} step={1} />
            <NumInput label="Quarter (days)" value={config.quarterLength} onChange={v => set('quarterLength', v)} min={10} step={10} />
          </Flex>
          <Text fontSize="2xs" color="gray.500" mt={1}>
            Resampled from N(mean, σ) every quarter. Nobody knows this value exactly.
          </Text>
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="bold" color="cyan.300" mb={2}>Market Makers</Text>
          <Flex gap={2} wrap="wrap">
            <NumInput label="Count" value={config.mmCount} onChange={v => set('mmCount', v)} min={1} max={20} step={1} />
            <NumInput label="Spread ($)" value={config.mmSpread} onChange={v => set('mmSpread', v)} min={0.01} step={0.05} />
            <NumInput label="Qty/Quote" value={config.mmQty} onChange={v => set('mmQty', v)} min={1} step={10} />
          </Flex>
          <Text fontSize="2xs" color="gray.500" mt={1}>
            Quote bid/ask around mid. Manage inventory. Trade every day.
          </Text>
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="bold" color="green.300" mb={2}>Retail ({config.retailCount})</Text>
          <Flex gap={2} wrap="wrap">
            <NumInput label="Count" value={config.retailCount} onChange={v => set('retailCount', v)} min={1} step={10} />
            <NumInput label="Noise σ ($)" value={config.retailStdDev} onChange={v => set('retailStdDev', v)} min={0.1} step={1} />
            <NumInput label="Qty" value={config.retailQty} onChange={v => set('retailQty', v)} min={1} step={5} />
            <NumInput label="Tolerance %" value={config.retailTolerance} onChange={v => set('retailTolerance', v)} min={0.1} step={0.5} />
            <NumInput label="Stop %" value={config.retailStopPct} onChange={v => set('retailStopPct', v)} min={0.5} step={0.5} />
          </Flex>
          <Text fontSize="2xs" color="gray.500" mt={1}>
            Won't trade unless price deviates &gt; tolerance % from their estimate. Bigger σ = less informed.
          </Text>
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="bold" color="orange.300" mb={2}>Institutions ({config.instCount})</Text>
          <Flex gap={2} wrap="wrap">
            <NumInput label="Count" value={config.instCount} onChange={v => set('instCount', v)} min={1} step={1} />
            <NumInput label="Noise σ ($)" value={config.instStdDev} onChange={v => set('instStdDev', v)} min={0.1} step={0.5} />
            <NumInput label="Qty" value={config.instQty} onChange={v => set('instQty', v)} min={10} step={50} />
            <NumInput label="Tolerance %" value={config.instTolerance} onChange={v => set('instTolerance', v)} min={0.1} step={0.5} />
            <NumInput label="Stop %" value={config.instStopPct} onChange={v => set('instStopPct', v)} min={0.5} step={0.5} />
          </Flex>
          <Text fontSize="2xs" color="gray.500" mt={1}>
            Won't trade unless price deviates &gt; tolerance % from their estimate. Smaller σ = better informed. Trades weekly.
          </Text>
        </Box>
      </Grid>
      <Flex gap={2} mt={3} wrap="wrap">
        <NumInput label="Initial Price ($)" value={config.initialPrice} onChange={v => set('initialPrice', v)} min={1} step={10} />
        <NumInput label="Order Expiry (days)" value={config.orderExpiry} onChange={v => set('orderExpiry', v)} min={5} step={5} />
      </Flex>
    </Card>
  );
}

function OrderBookDisplay({ book }: { book: OrderBook | null }) {
  if (!book) return null;
  const bids = book.topBids(8);
  const asks = book.topAsks(8).reverse();
  const maxQty = Math.max(...bids.map(l => l.qty), ...asks.map(l => l.qty), 1);

  return (
    <Box>
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Order Book</Text>
      <VStack gap={0}>
        {asks.map((l, i) => (
          <Flex key={`a-${i}`} w="100%" align="center" gap={1} position="relative">
            <Box position="absolute" right={0} top={0} bottom={0}
              bg="red.900" opacity={0.3}
              width={`${(l.qty / maxQty) * 100}%`} />
            <Text fontSize="xs" color="red.400" w="70px" textAlign="right">{l.price.toFixed(2)}</Text>
            <Text fontSize="xs" color="gray.400" w="60px" textAlign="right">{l.qty}</Text>
            <Text fontSize="2xs" color="gray.600" w="30px" textAlign="right">({l.count})</Text>
          </Flex>
        ))}
        <Flex w="100%" bg="whiteAlpha.100" px={1} py={0.5}>
          <Text fontSize="xs" fontWeight="bold" color="yellow.300">
            Spread: ${book.spread().toFixed(2)} | Mid: ${book.midPrice().toFixed(2)}
          </Text>
        </Flex>
        {bids.map((l, i) => (
          <Flex key={`b-${i}`} w="100%" align="center" gap={1} position="relative">
            <Box position="absolute" right={0} top={0} bottom={0}
              bg="green.900" opacity={0.3}
              width={`${(l.qty / maxQty) * 100}%`} />
            <Text fontSize="xs" color="green.400" w="70px" textAlign="right">{l.price.toFixed(2)}</Text>
            <Text fontSize="xs" color="gray.400" w="60px" textAlign="right">{l.qty}</Text>
            <Text fontSize="2xs" color="gray.600" w="30px" textAlign="right">({l.count})</Text>
          </Flex>
        ))}
      </VStack>
    </Box>
  );
}

function AgentSummary({ agents, price, initialPrice, tick }: { agents: AgentState[]; price: number; initialPrice: number; tick: number }) {
  const groups = useMemo(() => {
    const g: Record<string, { count: number; totalInitial: number; totalCurrent: number; totalPnl: number; spreadIncome: number }> = {};
    for (const a of agents) {
      if (!g[a.type]) g[a.type] = { count: 0, totalInitial: 0, totalCurrent: 0, totalPnl: 0, spreadIncome: 0 };
      g[a.type].count++;
      const currentVal = a.cash + a.shares * price;
      const initialVal = a.initialCash + a.initialShares * initialPrice;
      g[a.type].totalInitial += initialVal;
      g[a.type].totalCurrent += currentVal;
      g[a.type].totalPnl += currentVal - initialVal;
      g[a.type].spreadIncome += a.spreadIncome;
    }
    return g;
  }, [agents, price, initialPrice]);

  const labels: Record<string, { name: string; color: string }> = {
    mm: { name: 'Market Makers', color: 'cyan' },
    retail: { name: 'Retail', color: 'green' },
    institution: { name: 'Institutions', color: 'orange' },
  };

  const fmt = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPnl = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v)}`;
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

  const annualized = (totalReturn: number, days: number): number => {
    if (days <= 0 || totalReturn <= -1) return 0;
    return Math.pow(1 + totalReturn, 365 / days) - 1;
  };

  return (
    <Box>
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Agent Summary</Text>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs">Type</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" textAlign="right">N</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" textAlign="right">Total P&L</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" textAlign="right">Return</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" textAlign="right">Ann.</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {Object.entries(groups).map(([type, g]) => {
            const totalReturn = g.totalInitial > 0 ? g.totalPnl / g.totalInitial : 0;
            const ann = annualized(totalReturn, tick);
            return (
              <Table.Row key={type}>
                <Table.Cell fontSize="xs">
                  <Badge variant="subtle" colorPalette={labels[type]?.color} fontSize="2xs">
                    {labels[type]?.name ?? type}
                  </Badge>
                </Table.Cell>
                <Table.Cell fontSize="xs" textAlign="right">{g.count}</Table.Cell>
                <Table.Cell fontSize="xs" textAlign="right" color={g.totalPnl >= 0 ? 'green.300' : 'red.300'}>
                  {fmtPnl(g.totalPnl)}
                </Table.Cell>
                <Table.Cell fontSize="xs" textAlign="right" color={totalReturn >= 0 ? 'green.300' : 'red.300'}>
                  {fmtPct(totalReturn)}
                </Table.Cell>
                <Table.Cell fontSize="xs" textAlign="right" color={ann >= 0 ? 'green.300' : 'red.300'}>
                  {tick > 0 ? fmtPct(ann) : '—'}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
      {groups['mm'] && (
        <Box mt={2} p={2} bg="whiteAlpha.50" borderRadius="md">
          <Text fontSize="xs" color="gray.400">
            MM Spread Income (cumulative): <Text as="span" color="#4ade80" fontWeight="bold">{fmtPnl(groups['mm'].spreadIncome)}</Text>
          </Text>
          <Text fontSize="xs" color="gray.400">
            MM Inventory P&L: <Text as="span" color={groups['mm'].totalPnl - groups['mm'].spreadIncome >= 0 ? 'green.300' : 'red.300'} fontWeight="bold">
              {fmtPnl(groups['mm'].totalPnl - groups['mm'].spreadIncome)}
            </Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}

// =========================================================================
// Main Page
// =========================================================================
export default function MarketSimulation() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<SimConfig>({ ...DEFAULT_CONFIG });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);

  const bookRef = useRef<OrderBook | null>(null);
  const agentsRef = useRef<AgentState[]>([]);
  const tickRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const realValueRef = useRef({ value: 0 });

  const reset = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRunning(false);
    const rv = sampleRealValue(config);
    realValueRef.current = { value: rv };
    bookRef.current = new OrderBook(config.initialPrice);
    agentsRef.current = initAgents(config, rv);
    tickRef.current = 0;
    setSnapshots([{
      tick: 0, price: config.initialPrice, realValue: rv,
      bid: null, ask: null, spread: 0, volume: 0,
      bidDepth: 0, askDepth: 0,
      mmPnl: 0, retailPnl: 0, instPnl: 0, mmSpreadIncome: 0,
    }]);
  }, [config]);

  useEffect(() => { reset(); }, [reset]);

  const step = useCallback(() => {
    if (!bookRef.current) return;
    tickRef.current++;
    const snap = simulateStep(bookRef.current, agentsRef.current, tickRef.current, config, realValueRef.current);
    setSnapshots(prev => {
      const next = [...prev, snap];
      if (next.length > 2000) return next.slice(next.length - 2000);
      return next;
    });
  }, [config]);

  useEffect(() => {
    if (running) {
      const interval = Math.max(10, Math.round(100 / speed));
      timerRef.current = window.setInterval(() => {
        for (let i = 0; i < config.ticksPerStep; i++) step();
      }, interval);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, speed, step, config.ticksPerStep]);

  const lastSnap = snapshots[snapshots.length - 1];
  const priceChange = snapshots.length > 1
    ? lastSnap.price - snapshots[0].price
    : 0;

  const dayLabel = (t: number) => {
    const y = Math.floor(t / 365) + 1;
    const q = Math.floor((t % 365) / config.quarterLength) + 1;
    const d = (t % config.quarterLength) + 1;
    return `Y${y} Q${q} D${d}`;
  };

  // Vega-Lite specs
  const priceSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 300,
    padding: { left: 10, right: 20, top: 10, bottom: 10 },
    title: { text: 'Market Price vs. Real Value (1 tick = 1 day)', anchor: 'middle' as const },
    layer: [
      {
        data: { values: snapshots },
        mark: { type: 'line', strokeWidth: 1.5, color: '#60a5fa' },
        encoding: {
          x: { field: 'tick', type: 'quantitative', title: 'Day' },
          y: { field: 'price', type: 'quantitative', title: 'Price ($)', scale: { zero: false } },
        },
      },
      {
        data: { values: snapshots },
        mark: { type: 'line', strokeWidth: 2, color: '#facc15', strokeDash: [6, 4] },
        encoding: {
          x: { field: 'tick', type: 'quantitative' },
          y: { field: 'realValue', type: 'quantitative' },
        },
      },
      ...(snapshots.some(s => s.bid !== null) ? [{
        data: { values: snapshots.filter(s => s.bid !== null) },
        mark: { type: 'line', strokeWidth: 0.5, color: '#4ade80', opacity: 0.3 },
        encoding: {
          x: { field: 'tick', type: 'quantitative' },
          y: { field: 'bid', type: 'quantitative' },
        },
      }, {
        data: { values: snapshots.filter(s => s.ask !== null) },
        mark: { type: 'line', strokeWidth: 0.5, color: '#f87171', opacity: 0.3 },
        encoding: {
          x: { field: 'tick', type: 'quantitative' },
          y: { field: 'ask', type: 'quantitative' },
        },
      }] : []),
    ],
  }), [snapshots]);

  const volumeSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 120,
    padding: { left: 10, right: 20, top: 5, bottom: 10 },
    title: { text: 'Volume per Day', anchor: 'middle' as const },
    data: { values: snapshots },
    mark: { type: 'bar', color: '#a78bfa', opacity: 0.7 },
    encoding: {
      x: { field: 'tick', type: 'quantitative', title: 'Day' },
      y: { field: 'volume', type: 'quantitative', title: 'Volume' },
    },
  }), [snapshots]);

  const spreadSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 120,
    padding: { left: 10, right: 20, top: 5, bottom: 10 },
    title: { text: 'Bid-Ask Spread', anchor: 'middle' as const },
    data: { values: snapshots.filter(s => s.spread > 0) },
    mark: { type: 'line', strokeWidth: 1, color: '#facc15' },
    encoding: {
      x: { field: 'tick', type: 'quantitative', title: 'Day' },
      y: { field: 'spread', type: 'quantitative', title: 'Spread ($)', scale: { zero: true } },
    },
  }), [snapshots]);

  const depthSpec = useMemo(() => {
    const data = snapshots.flatMap(s => [
      { tick: s.tick, depth: s.bidDepth, side: 'Bid' },
      { tick: s.tick, depth: s.askDepth, side: 'Ask' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 120,
      padding: { left: 10, right: 20, top: 5, bottom: 10 },
      title: { text: 'Book Depth', anchor: 'middle' as const },
      data: { values: data },
      mark: { type: 'line', strokeWidth: 1 },
      encoding: {
        x: { field: 'tick', type: 'quantitative', title: 'Day' },
        y: { field: 'depth', type: 'quantitative', title: 'Total Qty' },
        color: {
          field: 'side', type: 'nominal',
          scale: { domain: ['Bid', 'Ask'], range: ['#4ade80', '#f87171'] },
        },
      },
    };
  }, [snapshots]);

  const pnlSpec = useMemo(() => {
    const data = snapshots.flatMap(s => [
      { tick: s.tick, pnl: s.mmPnl, agent: 'Market Makers' },
      { tick: s.tick, pnl: s.retailPnl, agent: 'Retail' },
      { tick: s.tick, pnl: s.instPnl, agent: 'Institutions' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 200,
      padding: { left: 10, right: 20, top: 5, bottom: 10 },
      title: { text: 'P&L by Agent Type (Total Portfolio Value vs. Initial)', anchor: 'middle' as const },
      data: { values: data },
      mark: { type: 'line', strokeWidth: 1.5 },
      encoding: {
        x: { field: 'tick', type: 'quantitative', title: 'Day' },
        y: { field: 'pnl', type: 'quantitative', title: 'P&L ($)', scale: { zero: false } },
        color: {
          field: 'agent', type: 'nominal',
          scale: {
            domain: ['Market Makers', 'Retail', 'Institutions'],
            range: ['#facc15', '#a78bfa', '#38bdf8'],
          },
        },
      },
    };
  }, [snapshots]);

  const mmIncomeSpec = useMemo(() => {
    const data = snapshots.map(s => ({
      tick: s.tick,
      spreadIncome: s.mmSpreadIncome,
      totalPnl: s.mmPnl,
    }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 200,
      padding: { left: 10, right: 20, top: 5, bottom: 10 },
      title: { text: 'Market Maker Income Breakdown', anchor: 'middle' as const },
      data: { values: data },
      layer: [
        {
          mark: { type: 'line', strokeWidth: 1.5, color: '#facc15' },
          encoding: {
            x: { field: 'tick', type: 'quantitative', title: 'Day' },
            y: { field: 'totalPnl', type: 'quantitative', title: 'P&L ($)' },
          },
        },
        {
          mark: { type: 'line', strokeWidth: 1.5, color: '#4ade80', strokeDash: [4, 4] },
          encoding: {
            x: { field: 'tick', type: 'quantitative' },
            y: { field: 'spreadIncome', type: 'quantitative' },
          },
        },
      ],
    };
  }, [snapshots]);

  return (
    <Box p={{ base: 2, md: 4 }} maxW="1600px" mx="auto">
      <Flex align="center" mb={4} gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={18} />
        </Button>
        <Heading size="lg" color={headingColor}>Market Simulation</Heading>
      </Flex>
      <Text fontSize="sm" color="gray.400" mb={4}>
        Agent-based market simulation with market makers, retail traders, and institutions trading through a central order book.
      </Text>

      <ConfigPanel config={config} setConfig={setConfig} />

      {/* Controls */}
      <Card mt={4}>
        <Flex gap={3} align="center" wrap="wrap">
          <Button size="sm" colorPalette={running ? 'red' : 'green'} onClick={() => setRunning(r => !r)}>
            {running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
          </Button>
          <Button size="sm" variant="outline" onClick={step} disabled={running}>
            Step
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </Button>
          <HStack gap={1}>
            {[1, 2, 5, 10].map(s => (
              <Button key={s} size="xs" variant={speed === s ? 'solid' : 'outline'}
                colorPalette={speed === s ? 'blue' : undefined}
                onClick={() => setSpeed(s)}>
                {s}x
              </Button>
            ))}
          </HStack>
          <Badge variant="subtle" colorPalette="gray" fontSize="xs">
            Day {lastSnap?.tick ?? 0} | {dayLabel(lastSnap?.tick ?? 0)}
          </Badge>
          <Badge variant="subtle" colorPalette="blue" fontSize="xs">
            Price: ${lastSnap?.price.toFixed(2)}
          </Badge>
          <Badge variant="subtle" colorPalette="yellow" fontSize="xs">
            Real Value: ${lastSnap?.realValue?.toFixed(2) ?? '?'}
          </Badge>
          <Badge variant="subtle" colorPalette={priceChange >= 0 ? 'green' : 'red'} fontSize="xs">
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({((priceChange / config.initialPrice) * 100).toFixed(2)}%)
          </Badge>
        </Flex>
      </Card>

      {/* Charts + Order Book */}
      <Grid templateColumns={{ base: '1fr', lg: '1fr 280px' }} gap={4} mt={4}>
        <VStack gap={4} align="stretch">
          <Card>
            <VegaProvider><VegaPlot spec={priceSpec} height="320px" /></VegaProvider>
          </Card>
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            <Card>
              <VegaProvider><VegaPlot spec={volumeSpec} height="140px" /></VegaProvider>
            </Card>
            <Card>
              <VegaProvider><VegaPlot spec={spreadSpec} height="140px" /></VegaProvider>
            </Card>
          </Grid>
          <Card>
            <VegaProvider><VegaPlot spec={depthSpec} height="140px" /></VegaProvider>
          </Card>
          <Card>
            <VegaProvider><VegaPlot spec={pnlSpec} height="220px" /></VegaProvider>
          </Card>
          <Card>
            <Box position="relative">
              <HStack gap={4} mb={1} justify="center">
                <HStack gap={1}><Box w={3} h={0.5} bg="#facc15" /><Text fontSize="xs" color="gray.400">Total P&L</Text></HStack>
                <HStack gap={1}><Box w={3} h={0.5} bg="#4ade80" style={{ borderTop: '2px dashed #4ade80' }} /><Text fontSize="xs" color="gray.400">Spread Income</Text></HStack>
              </HStack>
              <VegaProvider><VegaPlot spec={mmIncomeSpec} height="220px" /></VegaProvider>
            </Box>
          </Card>
        </VStack>

        <VStack gap={4} align="stretch">
          <Card>
            <OrderBookDisplay book={bookRef.current} />
          </Card>
          <Card>
            <AgentSummary agents={agentsRef.current} price={lastSnap?.price ?? config.initialPrice} initialPrice={config.initialPrice} tick={lastSnap?.tick ?? 0} />
          </Card>
        </VStack>
      </Grid>
    </Box>
  );
}
