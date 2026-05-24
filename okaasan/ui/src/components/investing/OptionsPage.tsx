import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Input, Button, Badge,
  Grid, Tabs, Table, IconButton,
} from '@chakra-ui/react';
import { ArrowLeft, Plus, Trash2, Shield } from 'lucide-react';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';
import 'katex/dist/katex.min.css';

// ---------------------------------------------------------------------------
// KaTeX helper
// ---------------------------------------------------------------------------
function Tex({ math, display = false }: { math: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const katex = (await import('katex')).default;
      if (mounted && ref.current) {
        katex.render(math, ref.current, { displayMode: display, throwOnError: false, strict: false });
      }
    })();
    return () => { mounted = false; };
  }, [math, display]);
  return <span ref={ref} />;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Leg {
  id: number;
  type: 'call' | 'put';
  side: 'buy' | 'sell';
  strike: number;
  premium: number;
  qty: number;
}

interface BSPosition {
  name: string;
  optType: 'call' | 'put';
  side: 'long' | 'short';
  K: number;
  sigma: number;
  qty: number;
}

interface ComputedGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  price: number;
}

// ---------------------------------------------------------------------------
// Black-Scholes math
// ---------------------------------------------------------------------------
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

function bsGreeks(optType: 'call' | 'put', S: number, K: number, T: number, r: number, sigma: number): ComputedGreeks {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, price: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const npd1 = normPdf(d1);
  const disc = Math.exp(-r * T);

  const gamma = npd1 / (S * sigma * sqrtT);
  const vega = S * npd1 * sqrtT / 100;

  if (optType === 'call') {
    const price = S * nd1 - K * disc * nd2;
    const delta = nd1;
    const theta = (-(S * npd1 * sigma) / (2 * sqrtT) - r * K * disc * nd2) / 365;
    const rho = K * T * disc * nd2 / 100;
    return { delta, gamma, theta, vega, rho, price };
  } else {
    const nnd1 = normCdf(-d1);
    const nnd2 = normCdf(-d2);
    const price = K * disc * nnd2 - S * nnd1;
    const delta = nd1 - 1;
    const theta = (-(S * npd1 * sigma) / (2 * sqrtT) + r * K * disc * nnd2) / 365;
    const rho = -K * T * disc * nnd2 / 100;
    return { delta, gamma, theta, vega, rho, price };
  }
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------
const cardBg = 'var(--card-bg, #1a1a2e)';
const headingColor = 'var(--heading-color, #e0e0e0)';

function Card({ children, ...props }: { children: React.ReactNode } & Record<string, any>) {
  return (
    <Box bg={cardBg} borderRadius="lg" p={4} border="1px solid" borderColor="whiteAlpha.100" {...props}>
      {children}
    </Box>
  );
}

function NumInput({ label, value, onChange, step, min, max, width = '100px' }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; width?: string;
}) {
  return (
    <VStack gap={0} align="start">
      <Text fontSize="xs" color="gray.400">{label}</Text>
      <Input
        type="number" size="sm" width={width}
        value={value} step={step} min={min} max={max}
        onChange={e => onChange(Number(e.target.value))}
      />
    </VStack>
  );
}

function SelectInput({ label, value, onChange, options, width = '100px' }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; width?: string;
}) {
  return (
    <VStack gap={0} align="start">
      <Text fontSize="xs" color="gray.400">{label}</Text>
      <Box as="select" bg="transparent" border="1px solid" borderColor="whiteAlpha.300"
        borderRadius="md" px={2} py={1} fontSize="sm" width={width}
        value={value} onChange={(e: any) => onChange(e.target.value)}
        color="inherit"
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: '#1a1a2e' }}>{o.label}</option>)}
      </Box>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Preset strategies
// ---------------------------------------------------------------------------
const PRESETS: Record<string, Omit<Leg, 'id'>[]> = {
  'Long Call': [{ type: 'call', side: 'buy', strike: 100, premium: 5, qty: 1 }],
  'Long Put': [{ type: 'put', side: 'buy', strike: 100, premium: 5, qty: 1 }],
  'Covered Call': [
    { type: 'call', side: 'sell', strike: 105, premium: 3, qty: 1 },
  ],
  'Protective Put': [
    { type: 'put', side: 'buy', strike: 95, premium: 3, qty: 1 },
  ],
  'Straddle': [
    { type: 'call', side: 'buy', strike: 100, premium: 5, qty: 1 },
    { type: 'put', side: 'buy', strike: 100, premium: 5, qty: 1 },
  ],
  'Strangle': [
    { type: 'call', side: 'buy', strike: 105, premium: 3, qty: 1 },
    { type: 'put', side: 'buy', strike: 95, premium: 3, qty: 1 },
  ],
  'Bull Call Spread': [
    { type: 'call', side: 'buy', strike: 95, premium: 7, qty: 1 },
    { type: 'call', side: 'sell', strike: 105, premium: 3, qty: 1 },
  ],
  'Bear Put Spread': [
    { type: 'put', side: 'buy', strike: 105, premium: 7, qty: 1 },
    { type: 'put', side: 'sell', strike: 95, premium: 3, qty: 1 },
  ],
  'Iron Condor': [
    { type: 'put', side: 'buy', strike: 85, premium: 1, qty: 1 },
    { type: 'put', side: 'sell', strike: 90, premium: 2, qty: 1 },
    { type: 'call', side: 'sell', strike: 110, premium: 2, qty: 1 },
    { type: 'call', side: 'buy', strike: 115, premium: 1, qty: 1 },
  ],
  'Iron Butterfly': [
    { type: 'put', side: 'buy', strike: 90, premium: 1, qty: 1 },
    { type: 'put', side: 'sell', strike: 100, premium: 5, qty: 1 },
    { type: 'call', side: 'sell', strike: 100, premium: 5, qty: 1 },
    { type: 'call', side: 'buy', strike: 110, premium: 1, qty: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Payoff computation
// ---------------------------------------------------------------------------
function computePayoff(legs: Leg[], priceRange: [number, number], steps = 200) {
  const [lo, hi] = priceRange;
  const data: { price: number; pnl: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const S = lo + (hi - lo) * (i / steps);
    let pnl = 0;
    for (const leg of legs) {
      const dir = leg.side === 'buy' ? 1 : -1;
      let intrinsic = 0;
      if (leg.type === 'call') intrinsic = Math.max(0, S - leg.strike);
      else intrinsic = Math.max(0, leg.strike - S);
      pnl += dir * (intrinsic - leg.premium) * leg.qty * 100;
    }
    data.push({ price: S, pnl });
  }
  return data;
}

function findBreakevens(data: { price: number; pnl: number }[]): number[] {
  const beps: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i - 1].pnl <= 0 && data[i].pnl >= 0) || (data[i - 1].pnl >= 0 && data[i].pnl <= 0)) {
      const frac = Math.abs(data[i - 1].pnl) / (Math.abs(data[i - 1].pnl) + Math.abs(data[i].pnl));
      beps.push(data[i - 1].price + frac * (data[i].price - data[i - 1].price));
    }
  }
  return beps;
}

// ---------------------------------------------------------------------------
// Black-Scholes Reference
// ---------------------------------------------------------------------------
function BlackScholesReference() {
  return (
    <Card flex="1 1 0" minW="320px">
      <Heading size="sm" color={headingColor} mb={3}>Black-Scholes Model</Heading>
      <VStack align="start" gap={3}>
        <Box>
          <Text fontSize="xs" color="gray.400" mb={1}>Call Price</Text>
          <Tex math="C = S\,N(d_1) - K\,e^{-rT}\,N(d_2)" display />
        </Box>
        <Box>
          <Text fontSize="xs" color="gray.400" mb={1}>Put Price</Text>
          <Tex math="P = K\,e^{-rT}\,N(-d_2) - S\,N(-d_1)" display />
        </Box>
        <Box>
          <Text fontSize="xs" color="gray.400" mb={1}>Where</Text>
          <Tex math="d_1 = \frac{\ln(S/K) + (r + \sigma^2/2)\,T}{\sigma\sqrt{T}}" display />
          <Tex math="d_2 = d_1 - \sigma\sqrt{T}" display />
        </Box>
        <Box borderTop="1px solid" borderColor="whiteAlpha.100" pt={2} w="100%">
          <Text fontSize="xs" color="gray.500" lineHeight="1.6">
            <Tex math="S" /> = spot price, <Tex math="K" /> = strike,{' '}
            <Tex math="T" /> = time to expiry (years), <Tex math="r" /> = risk-free rate,{' '}
            <Tex math="\sigma" /> = volatility, <Tex math="N(\cdot)" /> = standard normal CDF
          </Text>
        </Box>
      </VStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Greeks Digest
// ---------------------------------------------------------------------------
const GREEKS = [
  {
    name: 'Delta', symbol: '\\Delta',
    callFormula: 'N(d_1)', putFormula: 'N(d_1) - 1',
    range: 'Call: [0, 1], Put: [-1, 0]',
    desc: 'Rate of change of option price w.r.t. underlying price. Measures directional exposure.',
  },
  {
    name: 'Gamma', symbol: '\\Gamma',
    callFormula: '\\frac{N\'(d_1)}{S\\sigma\\sqrt{T}}', putFormula: '\\text{same}',
    range: 'Always positive',
    desc: 'Rate of change of Delta w.r.t. underlying price. Highest for ATM options near expiry.',
  },
  {
    name: 'Theta', symbol: '\\Theta',
    callFormula: '-\\frac{S\\,N\'(d_1)\\sigma}{2\\sqrt{T}} - rKe^{-rT}N(d_2)', putFormula: '-\\frac{S\\,N\'(d_1)\\sigma}{2\\sqrt{T}} + rKe^{-rT}N(-d_2)',
    range: 'Usually negative (time decay)',
    desc: 'Rate of change of option price w.r.t. time. Long options lose value as time passes.',
  },
  {
    name: 'Vega', symbol: '\\mathcal{V}',
    callFormula: 'S\\,N\'(d_1)\\sqrt{T}', putFormula: '\\text{same}',
    range: 'Always positive',
    desc: 'Sensitivity to implied volatility changes. Highest for ATM options with long time to expiry.',
  },
  {
    name: 'Rho', symbol: '\\rho',
    callFormula: 'KTe^{-rT}N(d_2)', putFormula: '-KTe^{-rT}N(-d_2)',
    range: 'Call: positive, Put: negative',
    desc: 'Sensitivity to interest rate changes. Usually the least impactful Greek for short-dated options.',
  },
];

function GreeksDigest() {
  return (
    <Card flex="1 1 0" minW="320px" overflow="auto">
      <Heading size="sm" color={headingColor} mb={3}>The Greeks</Heading>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs">Greek</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Call Formula</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Put Formula</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Range</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Interpretation</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {GREEKS.map(g => (
            <Table.Row key={g.name}>
              <Table.Cell fontWeight="bold">
                <Tex math={g.symbol} /> {g.name}
              </Table.Cell>
              <Table.Cell><Tex math={g.callFormula} /></Table.Cell>
              <Table.Cell><Tex math={g.putFormula} /></Table.Cell>
              <Table.Cell fontSize="xs" color="gray.400">{g.range}</Table.Cell>
              <Table.Cell fontSize="xs" color="gray.400" maxW="220px">{g.desc}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Strategy Builder
// ---------------------------------------------------------------------------
let nextLegId = 1;

function StrategyBuilderTab() {
  const [legs, setLegs] = useState<Leg[]>([
    { id: nextLegId++, type: 'call', side: 'buy', strike: 100, premium: 5, qty: 1 },
  ]);
  const [spotPrice, setSpotPrice] = useState(100);

  const addLeg = useCallback(() => {
    setLegs(prev => [...prev, { id: nextLegId++, type: 'call', side: 'buy', strike: 100, premium: 5, qty: 1 }]);
  }, []);

  const removeLeg = useCallback((id: number) => {
    setLegs(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLeg = useCallback((id: number, field: keyof Leg, value: any) => {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const applyPreset = useCallback((name: string) => {
    const preset = PRESETS[name];
    if (preset) setLegs(preset.map(p => ({ ...p, id: nextLegId++ })));
  }, []);

  const strikes = useMemo(() => legs.map(l => l.strike), [legs]);
  const priceRange = useMemo<[number, number]>(() => {
    const allStrikes = [...strikes, spotPrice];
    const mn = Math.min(...allStrikes);
    const mx = Math.max(...allStrikes);
    const pad = Math.max((mx - mn) * 0.5, 20);
    return [mn - pad, mx + pad];
  }, [strikes, spotPrice]);

  const payoffData = useMemo(() => computePayoff(legs, priceRange), [legs, priceRange]);
  const breakevens = useMemo(() => findBreakevens(payoffData), [payoffData]);
  const maxProfit = useMemo(() => {
    const mx = Math.max(...payoffData.map(d => d.pnl));
    return mx > 1e8 ? Infinity : mx;
  }, [payoffData]);
  const maxLoss = useMemo(() => {
    const mn = Math.min(...payoffData.map(d => d.pnl));
    return mn < -1e8 ? -Infinity : mn;
  }, [payoffData]);

  const payoffSpec = useMemo(() => {
    if (legs.length === 0) return null;
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 280,
      padding: { left: 10, right: 20, top: 10, bottom: 10 },
      title: { text: 'Payoff at Expiration', anchor: 'middle' as const },
      layer: [
        {
          data: { values: payoffData },
          mark: { type: 'area' as const, line: true, opacity: 0.3 },
          encoding: {
            x: { field: 'price', type: 'quantitative' as const, title: 'Underlying Price ($)', scale: { domain: priceRange } },
            y: { field: 'pnl', type: 'quantitative' as const, title: 'P&L ($)' },
            color: {
              condition: { test: 'datum.pnl >= 0', value: '#4ade80' },
              value: '#f87171',
            },
          },
        },
        {
          data: { values: [{ zero: 0 }] },
          mark: { type: 'rule' as const, strokeDash: [4, 4], color: 'gray' },
          encoding: { y: { datum: 0, type: 'quantitative' as const } },
        },
        {
          data: { values: [{ spot: spotPrice }] },
          mark: { type: 'rule' as const, color: '#a78bfa', strokeWidth: 2 },
          encoding: { x: { field: 'spot', type: 'quantitative' as const } },
        },
        ...breakevens.map(bp => ({
          data: { values: [{ bp }] },
          mark: { type: 'rule' as const, strokeDash: [2, 2], color: '#fbbf24' } as any,
          encoding: { x: { field: 'bp', type: 'quantitative' as const } },
        })),
      ],
    };
  }, [payoffData, priceRange, spotPrice, breakevens, legs.length]);

  return (
    <VStack gap={4} align="stretch">
      <Flex wrap="wrap" gap={2}>
        {Object.keys(PRESETS).map(name => (
          <Button key={name} size="xs" variant="outline" onClick={() => applyPreset(name)}>{name}</Button>
        ))}
      </Flex>

      <Card>
        <Flex justify="space-between" align="center" mb={2}>
          <Heading size="xs" color={headingColor}>Legs</Heading>
          <HStack>
            <NumInput label="Spot Price" value={spotPrice} onChange={setSpotPrice} step={1} width="90px" />
            <Button size="xs" variant="outline" onClick={addLeg}><Plus size={14} /> Add Leg</Button>
          </HStack>
        </Flex>
        <VStack gap={2} align="stretch">
          {legs.map(leg => (
            <Flex key={leg.id} gap={2} align="end" wrap="wrap">
              <SelectInput label="Type" value={leg.type} onChange={v => updateLeg(leg.id, 'type', v)}
                options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} width="80px" />
              <SelectInput label="Side" value={leg.side} onChange={v => updateLeg(leg.id, 'side', v)}
                options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} width="80px" />
              <NumInput label="Strike" value={leg.strike} onChange={v => updateLeg(leg.id, 'strike', v)} step={1} width="80px" />
              <NumInput label="Premium" value={leg.premium} onChange={v => updateLeg(leg.id, 'premium', v)} step={0.5} min={0} width="80px" />
              <NumInput label="Qty" value={leg.qty} onChange={v => updateLeg(leg.id, 'qty', v)} step={1} min={1} width="60px" />
              <IconButton size="xs" variant="ghost" colorPalette="red" onClick={() => removeLeg(leg.id)} aria-label="Remove leg">
                <Trash2 size={14} />
              </IconButton>
            </Flex>
          ))}
        </VStack>
      </Card>

      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={4}>
        <Card>
          {payoffSpec && (
            <VegaProvider>
              <VegaPlot spec={payoffSpec} height="300px" />
            </VegaProvider>
          )}
        </Card>
        <Card>
          <Heading size="xs" color={headingColor} mb={2}>Summary</Heading>
          <VStack align="start" gap={1}>
            <HStack>
              <Text fontSize="sm" color="gray.400">Max Profit:</Text>
              <Badge colorPalette="green">{maxProfit === Infinity ? 'Unlimited' : `$${maxProfit.toFixed(0)}`}</Badge>
            </HStack>
            <HStack>
              <Text fontSize="sm" color="gray.400">Max Loss:</Text>
              <Badge colorPalette="red">{maxLoss === -Infinity ? 'Unlimited' : `$${maxLoss.toFixed(0)}`}</Badge>
            </HStack>
            <HStack>
              <Text fontSize="sm" color="gray.400">Breakeven(s):</Text>
              <Text fontSize="sm">{breakevens.length > 0 ? breakevens.map(b => `$${b.toFixed(2)}`).join(', ') : '—'}</Text>
            </HStack>
            <Box borderTop="1px solid" borderColor="whiteAlpha.100" pt={2} mt={2} w="100%">
              <Text fontSize="xs" color="gray.500">
                Net premium: ${legs.reduce((s, l) => s + (l.side === 'buy' ? -1 : 1) * l.premium * l.qty * 100, 0).toFixed(0)}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Legs: {legs.map(l => `${l.side === 'buy' ? '+' : '-'}${l.qty} ${l.type.toUpperCase()} @${l.strike}`).join(', ')}
              </Text>
            </Box>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Portfolio Greeks (with hedge buttons)
// ---------------------------------------------------------------------------
type GreekKey = 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';
type HedgeTarget = GreekKey | 'delta+gamma' | 'all';

interface HedgeResult {
  target: HedgeTarget;
  actions: { label: string; qty: number; side: 'Buy' | 'Sell' }[];
  formula: string;
  residuals: Record<GreekKey, number>;
}

function solveHedge(
  totals: Record<GreekKey, number>,
  target: HedgeTarget,
  h1Greeks: ComputedGreeks,
  h1Name: string,
  h2Greeks: ComputedGreeks,
  h2Name: string,
): HedgeResult | null {
  const residuals = { ...totals };

  // Portfolio totals are already in "total" units (per-option * qty * 100).
  // Hedge instrument Greeks are per-option. One contract = 100 options.
  // So per-contract Greek = per-option Greek * 100.
  const M = 100;
  const g1 = { delta: h1Greeks.delta * M, gamma: h1Greeks.gamma * M, vega: h1Greeks.vega * M };
  const g2 = { delta: h2Greeks.delta * M, gamma: h2Greeks.gamma * M, vega: h2Greeks.vega * M };

  if (target === 'delta') {
    const shares = -totals.delta;
    residuals.delta = 0;
    return {
      target,
      actions: [{ label: 'Shares of underlying', qty: Math.abs(shares), side: shares >= 0 ? 'Buy' : 'Sell' }],
      formula: String.raw`n_{\text{shares}} = -\Delta_{\text{portfolio}} = ${shares >= 0 ? '' : '-'}${Math.abs(shares).toFixed(0)}`,
      residuals,
    };
  }

  if (target === 'gamma') {
    if (Math.abs(g1.gamma) < 1e-12) return null;
    const n = -totals.gamma / g1.gamma;
    residuals.gamma = 0;
    residuals.delta += n * g1.delta;
    residuals.vega += n * g1.vega;
    const sharesToFix = -residuals.delta;
    residuals.delta = 0;
    return {
      target,
      actions: [
        { label: `${h1Name} (contracts)`, qty: Math.abs(n), side: n >= 0 ? 'Buy' : 'Sell' },
        { label: 'Shares (delta cleanup)', qty: Math.abs(sharesToFix), side: sharesToFix >= 0 ? 'Buy' : 'Sell' },
      ],
      formula: String.raw`n_1 = -\frac{\Gamma_{\text{port}}}{\Gamma_1 \times 100} = -\frac{${totals.gamma.toFixed(2)}}{${g1.gamma.toFixed(2)}} = ${n.toFixed(1)} \text{ contracts}`,
      residuals,
    };
  }

  if (target === 'vega') {
    if (Math.abs(g2.vega) < 1e-12) return null;
    const n = -totals.vega / g2.vega;
    residuals.vega = 0;
    residuals.delta += n * g2.delta;
    residuals.gamma += n * g2.gamma;
    const sharesToFix = -residuals.delta;
    residuals.delta = 0;
    return {
      target,
      actions: [
        { label: `${h2Name} (contracts)`, qty: Math.abs(n), side: n >= 0 ? 'Buy' : 'Sell' },
        { label: 'Shares (delta cleanup)', qty: Math.abs(sharesToFix), side: sharesToFix >= 0 ? 'Buy' : 'Sell' },
      ],
      formula: String.raw`n_2 = -\frac{\mathcal{V}_{\text{port}}}{\mathcal{V}_2 \times 100} = -\frac{${totals.vega.toFixed(2)}}{${g2.vega.toFixed(2)}} = ${n.toFixed(1)} \text{ contracts}`,
      residuals,
    };
  }

  if (target === 'delta+gamma') {
    if (Math.abs(g1.gamma) < 1e-12) return null;
    const nOpt = -totals.gamma / g1.gamma;
    residuals.gamma = 0;
    residuals.delta += nOpt * g1.delta;
    residuals.vega += nOpt * g1.vega;
    const nShares = -residuals.delta;
    residuals.delta = 0;
    return {
      target,
      actions: [
        { label: `${h1Name} (contracts)`, qty: Math.abs(nOpt), side: nOpt >= 0 ? 'Buy' : 'Sell' },
        { label: 'Shares of underlying', qty: Math.abs(nShares), side: nShares >= 0 ? 'Buy' : 'Sell' },
      ],
      formula: String.raw`\Gamma\text{: } n_1 = ${nOpt.toFixed(1)} \text{ contracts} \quad\to\quad \Delta\text{-hedge: } ${nShares.toFixed(0)} \text{ shares}`,
      residuals,
    };
  }

  if (target === 'all') {
    const det = g1.gamma * g2.vega - g1.vega * g2.gamma;
    if (Math.abs(det) < 1e-12) return null;
    const n1 = (-totals.gamma * g2.vega - (-totals.vega) * g2.gamma) / det;
    const n2 = (g1.gamma * (-totals.vega) - g1.vega * (-totals.gamma)) / det;
    residuals.gamma += n1 * g1.gamma + n2 * g2.gamma;
    residuals.vega += n1 * g1.vega + n2 * g2.vega;
    residuals.delta += n1 * g1.delta + n2 * g2.delta;
    const nShares = -residuals.delta;
    residuals.delta = 0;
    return {
      target,
      actions: [
        { label: `${h1Name} (contracts)`, qty: Math.abs(n1), side: n1 >= 0 ? 'Buy' : 'Sell' },
        { label: `${h2Name} (contracts)`, qty: Math.abs(n2), side: n2 >= 0 ? 'Buy' : 'Sell' },
        { label: 'Shares of underlying', qty: Math.abs(nShares), side: nShares >= 0 ? 'Buy' : 'Sell' },
      ],
      formula: String.raw`n_1=${n1.toFixed(1)},\; n_2=${n2.toFixed(1)} \text{ contracts},\; ${nShares.toFixed(0)} \text{ shares}`,
      residuals,
    };
  }

  return null;
}

const HEDGE_BUTTONS: { target: HedgeTarget; label: string; desc: string }[] = [
  { target: 'delta', label: 'Hedge Delta', desc: 'Shares only — neutralize directional risk' },
  { target: 'gamma', label: 'Hedge Gamma', desc: 'Inst. 1 + shares — neutralize gamma + delta' },
  { target: 'vega', label: 'Hedge Vega', desc: 'Inst. 2 + shares — neutralize vega + delta' },
  { target: 'delta+gamma', label: 'Hedge Delta + Gamma', desc: 'Inst. 1 + shares — zero gamma and delta' },
  { target: 'all', label: 'Hedge All (Δ+Γ+V)', desc: 'Inst. 1 + Inst. 2 + shares — zero delta, gamma, and vega via 2x2 system' },
];

function PortfolioGreeksTab() {
  const [spotPrice, setSpotPrice] = useState(548);
  const [dte, setDte] = useState(30);
  const [riskFreeRate, setRiskFreeRate] = useState(5.0);

  const T = dte / 365;
  const r = riskFreeRate / 100;

  const [positions, setPositions] = useState<BSPosition[]>([
    { name: 'Long Call SPY 550', optType: 'call', side: 'long', K: 550, sigma: 0.20, qty: 10 },
    { name: 'Short Put SPY 540', optType: 'put', side: 'short', K: 540, sigma: 0.22, qty: 5 },
  ]);

  const [hedge1, setHedge1] = useState({
    name: 'Hedge Inst. 1',
    optType: 'call' as 'call' | 'put',
    K: 548, sigma: 0.20,
  });
  const [hedge2, setHedge2] = useState({
    name: 'Hedge Inst. 2',
    optType: 'put' as 'call' | 'put',
    K: 540, sigma: 0.22,
  });

  const [hedgeResult, setHedgeResult] = useState<HedgeResult | null>(null);

  const addPosition = useCallback(() => {
    setPositions(prev => [...prev, {
      name: 'New Position', optType: 'call', side: 'long',
      K: Math.round(spotPrice), sigma: 0.20, qty: 1,
    }]);
  }, [spotPrice]);

  const removePosition = useCallback((idx: number) => {
    setPositions(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updatePosition = useCallback((idx: number, field: keyof BSPosition, value: any) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }, []);

  const positionGreeks = useMemo(() =>
    positions.map(p => {
      const g = bsGreeks(p.optType, spotPrice, p.K, T, r, p.sigma);
      const dir = p.side === 'long' ? 1 : -1;
      return {
        ...g,
        delta: g.delta * dir,
        gamma: g.gamma * dir,
        theta: g.theta * dir,
        vega: g.vega * dir,
        rho: g.rho * dir,
        price: g.price,
      };
    }),
  [positions, spotPrice, T, r]);

  const totals = useMemo(() => {
    const t = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    for (let i = 0; i < positions.length; i++) {
      const g = positionGreeks[i];
      const mult = positions[i].qty * 100;
      t.delta += g.delta * mult;
      t.gamma += g.gamma * mult;
      t.theta += g.theta * mult;
      t.vega += g.vega * mult;
      t.rho += g.rho * mult;
    }
    return t;
  }, [positions, positionGreeks]);

  const h1Greeks = useMemo(() =>
    bsGreeks(hedge1.optType, spotPrice, hedge1.K, T, r, hedge1.sigma),
  [hedge1, spotPrice, T, r]);

  const h2Greeks = useMemo(() =>
    bsGreeks(hedge2.optType, spotPrice, hedge2.K, T, r, hedge2.sigma),
  [hedge2, spotPrice, T, r]);

  const runHedge = useCallback((target: HedgeTarget) => {
    const result = solveHedge(totals, target, h1Greeks, hedge1.name, h2Greeks, hedge2.name);
    setHedgeResult(result);
  }, [totals, h1Greeks, hedge1.name, h2Greeks, hedge2.name]);

  const barData = useMemo(() => [
    { greek: 'Delta', value: totals.delta },
    { greek: 'Gamma', value: totals.gamma },
    { greek: 'Theta', value: totals.theta },
    { greek: 'Vega', value: totals.vega },
    { greek: 'Rho', value: totals.rho },
  ], [totals]);

  const chartSpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 220,
    padding: { left: 10, right: 20, top: 10, bottom: 10 },
    title: { text: 'Net Greek Exposure', anchor: 'middle' as const },
    data: { values: barData },
    mark: { type: 'bar' as const, cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4 },
    encoding: {
      x: { field: 'greek', type: 'nominal' as const, title: null, axis: { labelAngle: 0 } },
      y: { field: 'value', type: 'quantitative' as const, title: 'Net Exposure' },
      color: {
        condition: { test: 'datum.value >= 0', value: '#4ade80' },
        value: '#f87171',
      },
    },
  }), [barData]);

  const greekMeta: { key: GreekKey; label: string; hint: string }[] = [
    { key: 'delta', label: 'Delta', hint: 'Directional risk' },
    { key: 'gamma', label: 'Gamma', hint: 'Convexity / hedge decay' },
    { key: 'theta', label: 'Theta', hint: 'Time decay per day' },
    { key: 'vega', label: 'Vega', hint: 'Volatility exposure' },
    { key: 'rho', label: 'Rho', hint: 'Interest rate sensitivity' },
  ];

  const fmtG = (v: number) => {
    if (Math.abs(v) < 0.0001) return '0';
    if (Math.abs(v) < 0.01) return v.toFixed(4);
    return v.toFixed(3);
  };

  return (
    <VStack gap={4} align="stretch">
      {/* Shared market parameters */}
      <Card>
        <Heading size="xs" color={headingColor} mb={2}>Market Parameters (shared)</Heading>
        <Flex gap={4} wrap="wrap">
          <NumInput label="Spot Price (S)" value={spotPrice} onChange={setSpotPrice} step={1} width="110px" />
          <NumInput label="DTE (days)" value={dte} onChange={setDte} step={1} min={1} width="90px" />
          <NumInput label="Risk-Free Rate (%)" value={riskFreeRate} onChange={setRiskFreeRate} step={0.25} width="130px" />
        </Flex>
      </Card>

      {/* Positions table — per-leg inputs only */}
      <Card>
        <Flex justify="space-between" align="center" mb={2}>
          <Heading size="xs" color={headingColor}>Positions</Heading>
          <Button size="xs" variant="outline" onClick={addPosition}><Plus size={14} /> Add Position</Button>
        </Flex>
        <Box overflowX="auto">
          <Table.Root size="sm" variant="outline">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader fontSize="xs">Name</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">Type</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">Side</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">Strike (K)</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">IV (%)</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">Qty</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">BS Price</Table.ColumnHeader>
                <Table.ColumnHeader></Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {positions.map((p, i) => (
                <Table.Row key={i}>
                  <Table.Cell>
                    <Input size="xs" value={p.name} onChange={e => updatePosition(i, 'name', e.target.value)} width="140px" />
                  </Table.Cell>
                  <Table.Cell>
                    <Box as="select" fontSize="xs" bg="transparent" border="1px solid" borderColor="whiteAlpha.300"
                      borderRadius="sm" px={1} py={0.5} width="60px" color="inherit"
                      value={p.optType} onChange={(e: any) => updatePosition(i, 'optType', e.target.value)}>
                      <option value="call" style={{ background: '#1a1a2e' }}>Call</option>
                      <option value="put" style={{ background: '#1a1a2e' }}>Put</option>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    <Box as="select" fontSize="xs" bg="transparent" border="1px solid" borderColor="whiteAlpha.300"
                      borderRadius="sm" px={1} py={0.5} width="65px" color="inherit"
                      value={p.side} onChange={(e: any) => updatePosition(i, 'side', e.target.value)}>
                      <option value="long" style={{ background: '#1a1a2e' }}>Long</option>
                      <option value="short" style={{ background: '#1a1a2e' }}>Short</option>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    <Input size="xs" type="number" step={1} value={p.K}
                      onChange={e => updatePosition(i, 'K', Number(e.target.value))} width="70px" />
                  </Table.Cell>
                  <Table.Cell>
                    <Input size="xs" type="number" step={1}
                      value={+(p.sigma * 100).toFixed(1)}
                      onChange={e => updatePosition(i, 'sigma', Number(e.target.value) / 100)} width="60px" />
                  </Table.Cell>
                  <Table.Cell>
                    <Input size="xs" type="number" step={1} min={1} value={p.qty}
                      onChange={e => updatePosition(i, 'qty', Number(e.target.value))} width="55px" />
                  </Table.Cell>
                  <Table.Cell fontSize="xs" color="gray.400">
                    ${positionGreeks[i]?.price.toFixed(2) ?? '—'}
                  </Table.Cell>
                  <Table.Cell>
                    <IconButton size="xs" variant="ghost" colorPalette="red" onClick={() => removePosition(i)} aria-label="Remove">
                      <Trash2 size={14} />
                    </IconButton>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Card>

      {/* Computed Greeks per position */}
      <Card>
        <Heading size="xs" color={headingColor} mb={2}>Computed Greeks (per option, before qty multiplier)</Heading>
        <Box overflowX="auto">
          <Table.Root size="sm" variant="outline">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader fontSize="xs">Position</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs">Side</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs"><Tex math="\Delta" /></Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs"><Tex math="\Gamma" /></Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs"><Tex math="\Theta" />/day</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs"><Tex math="\mathcal{V}" />/1%</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs"><Tex math="\rho" />/1%</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {positions.map((p, i) => {
                const g = positionGreeks[i];
                return (
                  <Table.Row key={i}>
                    <Table.Cell fontSize="xs">{p.name}</Table.Cell>
                    <Table.Cell>
                      <Badge size="sm" colorPalette={p.side === 'long' ? 'green' : 'red'}>
                        {p.side} {p.qty}x
                      </Badge>
                    </Table.Cell>
                    <Table.Cell fontSize="xs">{fmtG(g.delta)}</Table.Cell>
                    <Table.Cell fontSize="xs">{fmtG(g.gamma)}</Table.Cell>
                    <Table.Cell fontSize="xs">{fmtG(g.theta)}</Table.Cell>
                    <Table.Cell fontSize="xs">{fmtG(g.vega)}</Table.Cell>
                    <Table.Cell fontSize="xs">{fmtG(g.rho)}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Box>
      </Card>

      {/* Chart + Aggregate */}
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={4}>
        <Card>
          <VegaProvider>
            <VegaPlot spec={chartSpec} height="240px" />
          </VegaProvider>
        </Card>
        <Card>
          <Heading size="xs" color={headingColor} mb={2}>Aggregate Greeks</Heading>
          <VStack align="start" gap={2}>
            {greekMeta.map(({ key, label, hint }) => (
              <Box key={key} w="100%">
                <Flex justify="space-between">
                  <Text fontSize="sm" fontWeight="bold">{label}</Text>
                  <Badge colorPalette={totals[key] >= 0 ? 'green' : 'red'}>{totals[key].toFixed(2)}</Badge>
                </Flex>
                <Text fontSize="xs" color="gray.500">{hint}</Text>
              </Box>
            ))}
          </VStack>
          <Box borderTop="1px solid" borderColor="whiteAlpha.100" pt={2} mt={3}>
            <Text fontSize="xs" color="gray.500">
              Aggregated across all positions (qty x 100 multiplier per contract).
            </Text>
          </Box>
        </Card>
      </Grid>

      {/* Two hedging instruments (BS-based, share S/DTE/r) + hedge buttons */}
      <Card>
        <Heading size="xs" color={headingColor} mb={1}>Compute Hedge</Heading>
        <Text fontSize="xs" color="gray.400" mb={3}>
          Instrument 1 is used for Gamma hedges. Instrument 2 is used for Vega hedges.
          "Hedge All" solves a 2x2 system using both to zero Gamma + Vega, then delta-hedges with shares.
        </Text>
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={3}>
          <Box>
            <Text fontSize="xs" fontWeight="bold" color={headingColor} mb={2}>Instrument 1 (Gamma)</Text>
            <Flex gap={2} wrap="wrap" align="end">
              <Box>
                <Text fontSize="xs" color="gray.400" mb={1}>Name</Text>
                <Input size="sm" width="120px" value={hedge1.name}
                  onChange={e => setHedge1(prev => ({ ...prev, name: e.target.value }))} />
              </Box>
              <SelectInput label="Type" value={hedge1.optType}
                onChange={v => setHedge1(prev => ({ ...prev, optType: v as any }))}
                options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} width="65px" />
              <NumInput label="K" value={hedge1.K}
                onChange={v => setHedge1(prev => ({ ...prev, K: v }))} step={1} width="70px" />
              <NumInput label="IV (%)" value={+(hedge1.sigma * 100).toFixed(1)}
                onChange={v => setHedge1(prev => ({ ...prev, sigma: v / 100 }))} step={1} width="65px" />
            </Flex>
            <Box mt={2} p={2} bg="whiteAlpha.50" borderRadius="md">
              <Text fontSize="xs" color="gray.400">
                Δ={fmtG(h1Greeks.delta)}, Γ={fmtG(h1Greeks.gamma)}, V={fmtG(h1Greeks.vega)}, Price=${h1Greeks.price.toFixed(2)}
              </Text>
            </Box>
          </Box>
          <Box>
            <Text fontSize="xs" fontWeight="bold" color={headingColor} mb={2}>Instrument 2 (Vega)</Text>
            <Flex gap={2} wrap="wrap" align="end">
              <Box>
                <Text fontSize="xs" color="gray.400" mb={1}>Name</Text>
                <Input size="sm" width="120px" value={hedge2.name}
                  onChange={e => setHedge2(prev => ({ ...prev, name: e.target.value }))} />
              </Box>
              <SelectInput label="Type" value={hedge2.optType}
                onChange={v => setHedge2(prev => ({ ...prev, optType: v as any }))}
                options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} width="65px" />
              <NumInput label="K" value={hedge2.K}
                onChange={v => setHedge2(prev => ({ ...prev, K: v }))} step={1} width="70px" />
              <NumInput label="IV (%)" value={+(hedge2.sigma * 100).toFixed(1)}
                onChange={v => setHedge2(prev => ({ ...prev, sigma: v / 100 }))} step={1} width="65px" />
            </Flex>
            <Box mt={2} p={2} bg="whiteAlpha.50" borderRadius="md">
              <Text fontSize="xs" color="gray.400">
                Δ={fmtG(h2Greeks.delta)}, Γ={fmtG(h2Greeks.gamma)}, V={fmtG(h2Greeks.vega)}, Price=${h2Greeks.price.toFixed(2)}
              </Text>
            </Box>
          </Box>
        </Grid>

        <Flex gap={2} wrap="wrap" mb={4}>
          {HEDGE_BUTTONS.map(hb => (
            <Button key={hb.target} size="sm" variant="outline" onClick={() => runHedge(hb.target)}
              title={hb.desc}>
              <Shield size={14} /> {hb.label}
            </Button>
          ))}
        </Flex>

        {hedgeResult && (
          <Box bg="whiteAlpha.50" borderRadius="md" p={4}>
            <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>
              Hedge: {HEDGE_BUTTONS.find(h => h.target === hedgeResult.target)?.label}
            </Text>
            <Box mb={3}>
              <Tex math={hedgeResult.formula} display />
            </Box>
            <VStack align="start" gap={2} mb={3}>
              {hedgeResult.actions.filter(a => a.qty > 0.5).map((a, i) => (
                <HStack key={i}>
                  <Badge colorPalette={a.side === 'Buy' ? 'green' : 'red'}>{a.side}</Badge>
                  <Text fontSize="sm">{a.qty.toFixed(1)}</Text>
                  <Text fontSize="sm" color="gray.400">{a.label}</Text>
                </HStack>
              ))}
            </VStack>
            <Box borderTop="1px solid" borderColor="whiteAlpha.200" pt={2}>
              <Text fontSize="xs" color="gray.500" mb={1}>Residual Greeks after hedge:</Text>
              <Flex gap={3} wrap="wrap">
                {greekMeta.map(({ key, label }) => (
                  <HStack key={key} gap={1}>
                    <Text fontSize="xs" fontWeight="bold">{label}:</Text>
                    <Text fontSize="xs" color={Math.abs(hedgeResult.residuals[key]) < 0.5 ? 'green.400' : 'yellow.400'}>
                      {hedgeResult.residuals[key].toFixed(2)}
                    </Text>
                  </HStack>
                ))}
              </Flex>
            </Box>
          </Box>
        )}
      </Card>

      {/* Sensitivity analysis charts — one per Greek */}
      <SensitivityCharts
        positions={positions} spotPrice={spotPrice} T={T} r={r}
        hedgeResult={hedgeResult}
        h1Greeks={h1Greeks} h2Greeks={h2Greeks}
        hedge1={hedge1} hedge2={hedge2}
      />

      {/* Portfolio summary & margin requirements */}
      <PortfolioMarginSummary
        positions={positions} spotPrice={spotPrice} T={T} r={r}
        positionGreeks={positionGreeks} totals={totals}
        hedgeResult={hedgeResult}
        h1Greeks={h1Greeks} h2Greeks={h2Greeks}
        hedge1={hedge1} hedge2={hedge2}
      />
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Portfolio Summary & Collateral (Cash Account)
// ---------------------------------------------------------------------------

interface CashLine {
  name: string;
  tag: string;
  tagColor: string;
  qty: number;
  cashEffect: number;
  nakedCollateral: number;
  collateral: number;
  maxLoss: number;
  rule: string;
  isHedge: boolean;
}

function computeCashPortfolio(
  allLegs: { name: string; optType: 'call' | 'put'; side: 'long' | 'short'; K: number; qty: number; price: number; isHedge: boolean }[],
  sharesBuy: number,
  sharesSell: number,
  S: number,
): CashLine[] {
  const lines: CashLine[] = [];
  const shortLegs = allLegs.filter(l => l.side === 'short');
  const longLegs = allLegs.filter(l => l.side === 'long');
  let longSharesAvail = sharesBuy;

  const longAvail = longLegs.map(l => ({ ...l, avail: l.qty }));

  // --- Short options: you RECEIVE premium, but broker holds COLLATERAL ---
  for (const leg of shortLegs) {
    const premium = leg.price * leg.qty * 100;
    const nakedCollateral = leg.optType === 'put'
      ? leg.K * leg.qty * 100
      : S * leg.qty * 100;
    let uncoveredQty = leg.qty;
    let collateral = 0;
    let maxLoss: number;
    let rule = '';

    // Shares cover short calls → covered call, no collateral needed on those
    if (leg.optType === 'call' && longSharesAvail > 0) {
      const covered = Math.min(uncoveredQty, Math.floor(longSharesAvail / 100));
      if (covered > 0) {
        longSharesAvail -= covered * 100;
        uncoveredQty -= covered;
        rule = `Covered call (${covered} by ${covered * 100} shares)`;
      }
    }

    // Long options of same type → spread: collateral = spread width only
    // Match tightest strikes first to minimize collateral
    while (uncoveredQty > 0) {
      const candidates = longAvail
        .filter(l => l.optType === leg.optType && l.avail > 0)
        .sort((a, b) => Math.abs(leg.K - a.K) - Math.abs(leg.K - b.K));
      if (candidates.length === 0) break;
      const cover = candidates[0];
      const spreadQty = Math.min(uncoveredQty, cover.avail);
      const spreadWidth = Math.abs(leg.K - cover.K) * spreadQty * 100;
      collateral += spreadWidth;
      cover.avail -= spreadQty;
      uncoveredQty -= spreadQty;
      const tag = `Spread (${spreadQty} by ${cover.name}): |K₁−K₂|×100 = ${fmt$Simple(spreadWidth)}`;
      rule = rule ? `${rule} + ${tag}` : tag;
    }

    // Remaining uncovered: cash-secured
    if (uncoveredQty > 0) {
      if (leg.optType === 'put') {
        const secured = leg.K * uncoveredQty * 100;
        collateral += secured;
        const tag = `Cash-secured put: K×100×qty = ${fmt$Simple(secured)}`;
        rule = rule ? `${rule} + ${tag}` : tag;
      } else {
        const secured = S * uncoveredQty * 100;
        collateral += secured;
        const tag = `Naked call collateral: S×100×qty = ${fmt$Simple(secured)} (most brokers reject in cash acct)`;
        rule = rule ? `${rule} + ${tag}` : tag;
      }
    }

    maxLoss = leg.optType === 'call' && uncoveredQty > 0
      ? Infinity
      : collateral;

    lines.push({
      name: leg.name,
      tag: `short ${leg.optType}`,
      tagColor: 'red',
      qty: leg.qty,
      cashEffect: premium,
      nakedCollateral,
      collateral,
      maxLoss,
      rule: rule || 'Fully covered',
      isHedge: leg.isHedge,
    });
  }

  // --- Long options: you PAY premium (cost), no collateral, but reduces shorts above ---
  for (const leg of allLegs.filter(l => l.side === 'long')) {
    const premium = leg.price * leg.qty * 100;
    const usedAsCover = leg.qty - (longAvail.find(la => la.name === leg.name)?.avail ?? leg.qty);
    lines.push({
      name: leg.name,
      tag: `long ${leg.optType}`,
      tagColor: 'green',
      qty: leg.qty,
      cashEffect: -premium,
      nakedCollateral: 0,
      collateral: 0,
      maxLoss: premium,
      rule: usedAsCover > 0
        ? `Premium paid; ${usedAsCover} contract(s) used as spread cover above`
        : 'Premium paid',
      isHedge: leg.isHedge,
    });
  }

  // Long shares: cash purchase, no collateral, but covers short calls above
  if (sharesBuy > 0) {
    const cost = sharesBuy * S;
    lines.push({
      name: 'Buy underlying shares',
      tag: 'long shares',
      tagColor: 'blue',
      qty: sharesBuy,
      cashEffect: -cost,
      nakedCollateral: 0,
      collateral: 0,
      maxLoss: cost,
      rule: 'Cash purchase; covers short calls',
      isHedge: true,
    });
  }

  // Short shares: receive proceeds, broker holds collateral
  if (sharesSell > 0) {
    const proceeds = sharesSell * S;
    lines.push({
      name: 'Short sell shares',
      tag: 'short shares',
      tagColor: 'orange',
      qty: sharesSell,
      cashEffect: proceeds,
      nakedCollateral: proceeds,
      collateral: proceeds,
      maxLoss: Infinity,
      rule: 'Proceeds held as collateral (unlimited risk)',
      isHedge: true,
    });
  }

  return lines;
}

function fmt$Simple(v: number) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function detectSpreads(positions: BSPosition[]): string[] {
  const tags: string[] = [];
  const calls = positions.filter(p => p.optType === 'call');
  const puts = positions.filter(p => p.optType === 'put');

  for (const leg of calls) {
    const opposite = calls.find(o => o !== leg && o.side !== leg.side);
    if (opposite) {
      const longLeg = leg.side === 'long' ? leg : opposite;
      const shortLeg = leg.side === 'short' ? leg : opposite;
      if (longLeg.K < shortLeg.K) tags.push(`Bull call spread (${longLeg.K}/${shortLeg.K})`);
      else if (longLeg.K > shortLeg.K) tags.push(`Bear call spread (${shortLeg.K}/${longLeg.K})`);
    }
  }
  for (const leg of puts) {
    const opposite = puts.find(o => o !== leg && o.side !== leg.side);
    if (opposite) {
      const longLeg = leg.side === 'long' ? leg : opposite;
      const shortLeg = leg.side === 'short' ? leg : opposite;
      if (longLeg.K > shortLeg.K) tags.push(`Bear put spread (${shortLeg.K}/${longLeg.K})`);
      else if (longLeg.K < shortLeg.K) tags.push(`Bull put spread (${longLeg.K}/${shortLeg.K})`);
    }
  }

  const longCall = calls.find(c => c.side === 'long');
  const longPut = puts.find(p => p.side === 'long');
  if (longCall && longPut && Math.abs(longCall.K - longPut.K) < 0.01 && longCall.qty === longPut.qty)
    tags.push(`Straddle at ${longCall.K}`);
  if (longCall && longPut && Math.abs(longCall.K - longPut.K) > 0.01 && longCall.qty === longPut.qty)
    tags.push(`Strangle (${longPut.K}/${longCall.K})`);

  const shortCall = calls.find(c => c.side === 'short');
  const shortPut = puts.find(p => p.side === 'short');
  if (shortCall && shortPut) {
    if (longCall && longPut && longCall.K > shortCall.K && longPut.K < shortPut.K)
      tags.push('Iron condor detected');
    else if (longCall && longPut && Math.abs(shortCall.K - shortPut.K) < 0.01)
      tags.push('Iron butterfly detected');
  }

  if (tags.length === 0) tags.push('Custom / unclassified strategy');
  return [...new Set(tags)];
}

interface ExecStep {
  order: number;
  action: 'BUY' | 'SELL';
  description: string;
  cashEffect: number;
  reason: string;
}

function ExecutionOrder({ cashLines, spotPrice }: { cashLines: CashLine[]; spotPrice: number }) {
  const steps = useMemo(() => {
    const result: ExecStep[] = [];
    let step = 0;

    // Phase 1: Buy shares first — they cover short calls (cheapest collateral reduction)
    for (const l of cashLines) {
      if (l.tag === 'long shares') {
        result.push({
          order: ++step, action: 'BUY',
          description: `${l.qty} shares @ ${spotPrice.toFixed(2)}`,
          cashEffect: l.cashEffect,
          reason: 'Establishes share position; will cover short calls',
        });
      }
    }

    // Phase 2: Buy long options — they create spread coverage for upcoming shorts
    for (const l of cashLines) {
      if (l.tag.startsWith('long ') && l.tag !== 'long shares') {
        result.push({
          order: ++step, action: 'BUY',
          description: `${l.qty}× ${l.name}`,
          cashEffect: l.cashEffect,
          reason: 'Long option in place before selling; reduces collateral on matching short',
        });
      }
    }

    // Phase 3: Sell short options — collateral is minimized by existing longs/shares
    for (const l of cashLines) {
      if (l.tag.startsWith('short ') && l.tag !== 'short shares') {
        const saving = l.nakedCollateral > l.collateral
          ? ` (collateral ${l.nakedCollateral > 0 ? `reduced from $${l.nakedCollateral.toLocaleString()} to $${l.collateral.toLocaleString()}` : 'covered'})`
          : '';
        result.push({
          order: ++step, action: 'SELL',
          description: `${l.qty}× ${l.name}`,
          cashEffect: l.cashEffect,
          reason: `Receives premium${saving}`,
        });
      }
    }

    // Phase 4: Short sell shares last
    for (const l of cashLines) {
      if (l.tag === 'short shares') {
        result.push({
          order: ++step, action: 'SELL',
          description: `${l.qty} shares @ ${spotPrice.toFixed(2)}`,
          cashEffect: l.cashEffect,
          reason: 'Short sell; proceeds held as collateral',
        });
      }
    }

    return result;
  }, [cashLines, spotPrice]);

  if (steps.length < 2) return null;

  return (
    <Box bg="whiteAlpha.50" borderRadius="md" p={3} mt={3}>
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>
        Suggested Execution Order
      </Text>
      <Text fontSize="2xs" color="gray.500" mb={2}>
        Buy longs first to establish spread coverage, then sell shorts to minimize collateral.
      </Text>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs" w="40px">#</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" w="60px">Action</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Instrument</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs" textAlign="right">Cash Effect</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Reason</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {steps.map(s => (
            <Table.Row key={s.order}>
              <Table.Cell fontSize="xs" color="gray.400">{s.order}</Table.Cell>
              <Table.Cell fontSize="xs">
                <Badge variant="subtle" colorPalette={s.action === 'BUY' ? 'green' : 'red'} fontSize="2xs">
                  {s.action}
                </Badge>
              </Table.Cell>
              <Table.Cell fontSize="xs">{s.description}</Table.Cell>
              <Table.Cell fontSize="xs" textAlign="right" color={s.cashEffect >= 0 ? 'green.300' : 'red.300'}>
                {s.cashEffect >= 0
                  ? `+$${s.cashEffect.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : `-$${Math.abs(s.cashEffect).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </Table.Cell>
              <Table.Cell fontSize="xs" color="gray.500">{s.reason}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function PortfolioMarginSummary({
  positions, spotPrice, T: _T, r: _r, positionGreeks, totals: _totals,
  hedgeResult, h1Greeks, h2Greeks, hedge1, hedge2,
}: {
  positions: BSPosition[];
  spotPrice: number;
  T: number;
  r: number;
  positionGreeks: ComputedGreeks[];
  totals: Record<GreekKey, number>;
  hedgeResult: HedgeResult | null;
  h1Greeks: ComputedGreeks;
  h2Greeks: ComputedGreeks;
  hedge1: { name: string; optType: 'call' | 'put'; K: number; sigma: number };
  hedge2: { name: string; optType: 'call' | 'put'; K: number; sigma: number };
}) {
  const spreadTags = useMemo(() => {
    const allPos = [...positions];
    if (hedgeResult) {
      for (const a of hedgeResult.actions) {
        if (a.label.includes('Shares') || a.qty < 0.5) continue;
        const isH1 = a.label.includes(hedge1.name);
        const inst = isH1 ? hedge1 : hedge2;
        allPos.push({
          name: a.label, optType: inst.optType,
          side: a.side === 'Buy' ? 'long' : 'short',
          K: inst.K, sigma: inst.sigma, qty: Math.round(a.qty),
        });
      }
    }
    return detectSpreads(allPos);
  }, [positions, hedgeResult, hedge1, hedge2]);

  const posLegs = useMemo(() => {
    const legs: Parameters<typeof computeCashPortfolio>[0] = [];
    for (let i = 0; i < positions.length; i++) {
      legs.push({
        name: positions[i].name,
        optType: positions[i].optType,
        side: positions[i].side,
        K: positions[i].K,
        qty: positions[i].qty,
        price: positionGreeks[i].price,
        isHedge: false,
      });
    }
    return legs;
  }, [positions, positionGreeks]);

  // Full portfolio (positions + hedge)
  const cashLines = useMemo(() => {
    const allLegs = [...posLegs];
    let sharesBuy = 0, sharesSell = 0;
    if (hedgeResult) {
      for (const a of hedgeResult.actions) {
        if (a.qty < 0.5) continue;
        if (a.label.includes('Shares')) {
          if (a.side === 'Buy') sharesBuy += Math.round(a.qty);
          else sharesSell += Math.round(a.qty);
        } else {
          const isH1 = a.label.includes(hedge1.name);
          const inst = isH1 ? hedge1 : hedge2;
          const greeks = isH1 ? h1Greeks : h2Greeks;
          allLegs.push({
            name: `${a.side} ${Math.round(a.qty)} ${inst.name}`,
            optType: inst.optType,
            side: a.side === 'Buy' ? 'long' : 'short',
            K: inst.K,
            qty: Math.round(a.qty),
            price: greeks.price,
            isHedge: true,
          });
        }
      }
    }

    return computeCashPortfolio(allLegs, sharesBuy, sharesSell, spotPrice);
  }, [posLegs, spotPrice, hedgeResult, hedge1, hedge2, h1Greeks, h2Greeks]);

  const totalNakedCollateral = cashLines.reduce((s, l) => s + l.nakedCollateral, 0);
  const totalCashEffect = cashLines.reduce((s, l) => s + l.cashEffect, 0);
  const totalCollateral = cashLines.reduce((s, l) => s + l.collateral, 0);
  const premiumsReceived = cashLines.filter(l => l.cashEffect > 0).reduce((s, l) => s + l.cashEffect, 0);
  const cashNeeded = totalCollateral - premiumsReceived;
  const hasHedge = hedgeResult !== null;
  const collateralSaved = hasHedge ? totalNakedCollateral - totalCollateral : 0;

  const fmt$ = (v: number) => {
    if (!isFinite(v)) return '∞';
    return v < 0
      ? `-$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  return (
    <Card>
      <Heading size="xs" color={headingColor} mb={3}>
        Portfolio Summary &amp; Collateral (Cash Account)
      </Heading>

      <Flex gap={2} mb={4} wrap="wrap">
        {spreadTags.map((tag, i) => (
          <Badge key={i} variant="subtle" colorPalette="purple" fontSize="xs">{tag}</Badge>
        ))}
      </Flex>

      {/* Per-leg breakdown */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>
        Per-Leg Breakdown {hedgeResult ? '(Positions + Hedge)' : ''}
      </Text>
      <Box overflowX="auto" mb={4}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader fontSize="xs">Leg</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Type</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs" textAlign="right">Qty</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs" textAlign="right">Cash Effect</Table.ColumnHeader>
              {hasHedge && <Table.ColumnHeader fontSize="xs" textAlign="right">Standalone Collateral</Table.ColumnHeader>}
              <Table.ColumnHeader fontSize="xs" textAlign="right">Collateral{hasHedge ? ' (net)' : ''}</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs" textAlign="right">Max Loss</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">How It Works</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {cashLines.map((l, i) => {
              const standaloneCol = l.nakedCollateral;
              const showReduction = hasHedge && standaloneCol > l.collateral;
              return (
                <Table.Row key={i} bg={l.isHedge ? 'whiteAlpha.50' : undefined}>
                  <Table.Cell fontSize="xs">
                    {l.isHedge && <Badge variant="subtle" colorPalette="cyan" fontSize="2xs" mr={1}>HEDGE</Badge>}
                    {l.name}
                  </Table.Cell>
                  <Table.Cell fontSize="xs">
                    <Badge variant="subtle" colorPalette={l.tagColor} fontSize="2xs">{l.tag}</Badge>
                  </Table.Cell>
                  <Table.Cell fontSize="xs" textAlign="right">{l.qty}</Table.Cell>
                  <Table.Cell fontSize="xs" textAlign="right" color={l.cashEffect >= 0 ? 'green.300' : 'red.300'}>
                    {l.cashEffect >= 0 ? `+${fmt$(l.cashEffect)}` : fmt$(l.cashEffect)}
                    <Text as="span" fontSize="2xs" color="gray.500" ml={1}>
                      {l.cashEffect >= 0 ? 'income' : 'cost'}
                    </Text>
                  </Table.Cell>
                  {hasHedge && (
                    <Table.Cell fontSize="xs" textAlign="right" color={standaloneCol > 0 ? 'orange.300' : 'gray.500'}>
                      {standaloneCol > 0 ? fmt$(standaloneCol) : '—'}
                    </Table.Cell>
                  )}
                  <Table.Cell fontSize="xs" textAlign="right" color={l.collateral > 0 ? 'yellow.300' : showReduction ? 'green.400' : 'gray.500'}>
                    {l.collateral > 0 ? fmt$(l.collateral) : showReduction ? '$0 (covered)' : '—'}
                  </Table.Cell>
                  <Table.Cell fontSize="xs" textAlign="right" color={l.maxLoss === Infinity ? 'red.400' : 'gray.300'}>
                    {l.maxLoss === Infinity ? 'Unlimited' : fmt$(l.maxLoss)}
                  </Table.Cell>
                  <Table.Cell fontSize="xs" color="gray.500">{l.rule}</Table.Cell>
                </Table.Row>
              );
            })}
            <Table.Row bg="whiteAlpha.100">
              <Table.Cell fontSize="xs" fontWeight="bold" colSpan={3}>TOTALS</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold" textAlign="right"
                color={totalCashEffect >= 0 ? 'green.300' : 'red.300'}>
                {totalCashEffect >= 0 ? `+${fmt$(totalCashEffect)}` : fmt$(totalCashEffect)}
              </Table.Cell>
              {hasHedge && (
                <Table.Cell fontSize="xs" fontWeight="bold" textAlign="right" color="orange.300">
                  {fmt$(totalNakedCollateral)}
                </Table.Cell>
              )}
              <Table.Cell fontSize="xs" fontWeight="bold" textAlign="right" color="yellow.300">
                {fmt$(totalCollateral)}
              </Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold" textAlign="right" color="gray.300">
                {cashLines.some(l => l.maxLoss === Infinity) ? 'Unlimited' : fmt$(cashLines.reduce((s, l) => s + l.maxLoss, 0))}
              </Table.Cell>
              <Table.Cell></Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Account summary */}
      <Box bg="whiteAlpha.50" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Account Summary</Text>
        <Grid templateColumns={{ base: '1fr', sm: hasHedge ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr' }} gap={4}>
          <VStack gap={0}>
            <Text fontSize="xs" color="gray.400">Costs (debits)</Text>
            <Text fontSize="lg" fontWeight="bold" color="red.300">
              {fmt$(Math.abs(cashLines.filter(l => l.cashEffect < 0).reduce((s, l) => s + l.cashEffect, 0)))}
            </Text>
            <Text fontSize="2xs" color="gray.500">premiums + purchases</Text>
          </VStack>
          <VStack gap={0}>
            <Text fontSize="xs" color="gray.400">Income (credits)</Text>
            <Text fontSize="lg" fontWeight="bold" color="green.300">
              +{fmt$(premiumsReceived)}
            </Text>
            <Text fontSize="2xs" color="gray.500">premiums received</Text>
          </VStack>
          <VStack gap={0}>
            <Text fontSize="xs" color="gray.400">Collateral{hasHedge ? ' (after hedge)' : ''}</Text>
            <Text fontSize="lg" fontWeight="bold" color="yellow.300">
              {fmt$(totalCollateral)}
            </Text>
            {hasHedge && collateralSaved > 0 ? (
              <Text fontSize="2xs" color="green.400">
                was {fmt$(totalNakedCollateral)}, saved {fmt$(collateralSaved)}
              </Text>
            ) : (
              <Text fontSize="2xs" color="gray.500">broker holds for shorts</Text>
            )}
          </VStack>
          {hasHedge && (
            <VStack gap={0}>
              <Text fontSize="xs" color="gray.400">Collateral Saved</Text>
              <Text fontSize="lg" fontWeight="bold" color="green.400">
                −{fmt$(collateralSaved)}
              </Text>
              <Text fontSize="2xs" color="gray.500">hedge covers short risk</Text>
            </VStack>
          )}
          <VStack gap={0}>
            <Text fontSize="xs" color="gray.400">Cash Needed in Acct.</Text>
            <Text fontSize="lg" fontWeight="bold" color="cyan.300">
              {fmt$(Math.max(0, cashNeeded))}
            </Text>
            <Text fontSize="2xs" color="gray.500">collateral − premiums received</Text>
          </VStack>
        </Grid>
        <Box mt={3} pt={2} borderTop="1px solid" borderColor="whiteAlpha.200">
          <Flex justify="space-between">
            <Text fontSize="xs" color="gray.400">Net cash effect on account</Text>
            <Text fontSize="sm" fontWeight="bold" color={totalCashEffect >= 0 ? 'green.300' : 'red.300'}>
              {totalCashEffect >= 0 ? `+${fmt$(totalCashEffect)}` : fmt$(totalCashEffect)}
              <Text as="span" fontSize="2xs" color="gray.500" ml={1}>
                {totalCashEffect >= 0 ? '(net credit)' : '(net debit)'}
              </Text>
            </Text>
          </Flex>
        </Box>
      </Box>

      {/* Suggested execution order */}
      <ExecutionOrder cashLines={cashLines} spotPrice={spotPrice} />

      <Text fontSize="xs" color="gray.500" mt={3}>
        Cash account: no leverage. Long options cost the premium. Short options bring in premium
        but the broker holds collateral — cash-secured put: K×100, naked call: S×100.
        A long option of the same type turns a short into a spread, reducing collateral to just the
        spread width. Long shares cover short calls (covered call = no extra collateral).
        Premiums received from shorts offset the cash you need from your own pocket.
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Portfolio Sensitivity Charts (one per Greek)
// ---------------------------------------------------------------------------
interface HedgeLeg {
  optType: 'call' | 'put';
  K: number;
  sigma: number;
  contracts: number;
}

function parseHedgeActions(
  hedgeResult: HedgeResult | null,
  hedge1: { name: string; optType: 'call' | 'put'; K: number; sigma: number },
  hedge2: { name: string; optType: 'call' | 'put'; K: number; sigma: number },
  h1Greeks: ComputedGreeks,
  h2Greeks: ComputedGreeks,
  spotPrice: number,
) {
  let sharesQty = 0;
  let sharesDir = 0;
  const legs: HedgeLeg[] = [];
  let baselineCost = 0;

  if (!hedgeResult) return { sharesQty, sharesDir, legs, baselineCost };

  for (const action of hedgeResult.actions) {
    const dir = action.side === 'Buy' ? 1 : -1;
    if (action.label.includes('Shares')) {
      sharesQty = action.qty;
      sharesDir = dir;
      baselineCost += dir * action.qty * spotPrice;
    } else if (action.label.includes(hedge1.name)) {
      legs.push({ ...hedge1, contracts: dir * action.qty });
      baselineCost += h1Greeks.price * dir * action.qty * 100;
    } else if (action.label.includes(hedge2.name)) {
      legs.push({ ...hedge2, contracts: dir * action.qty });
      baselineCost += h2Greeks.price * dir * action.qty * 100;
    }
  }
  return { sharesQty, sharesDir, legs, baselineCost };
}

function evalPortfolio(positions: BSPosition[], S: number, T: number, r: number, sigmaShift: number) {
  let val = 0;
  for (const p of positions) {
    const g = bsGreeks(p.optType, S, p.K, T, r, p.sigma + sigmaShift);
    const dir = p.side === 'long' ? 1 : -1;
    val += g.price * dir * p.qty * 100;
  }
  return val;
}

function evalHedged(
  portfolioVal: number,
  legs: HedgeLeg[],
  sharesDir: number, sharesQty: number,
  S: number, T: number, r: number, sigmaShift: number,
) {
  let val = portfolioVal;
  val += sharesDir * sharesQty * S;
  for (const leg of legs) {
    const g = bsGreeks(leg.optType, S, leg.K, T, r, leg.sigma + sigmaShift);
    val += g.price * leg.contracts * 100;
  }
  return val;
}

function SensitivityCharts({ positions, spotPrice, T, r, hedgeResult, h1Greeks, h2Greeks, hedge1, hedge2 }: {
  positions: BSPosition[];
  spotPrice: number;
  T: number;
  r: number;
  hedgeResult: HedgeResult | null;
  h1Greeks: ComputedGreeks;
  h2Greeks: ComputedGreeks;
  hedge1: { name: string; optType: 'call' | 'put'; K: number; sigma: number };
  hedge2: { name: string; optType: 'call' | 'put'; K: number; sigma: number };
}) {
  const hasHedge = hedgeResult !== null;

  const hedge = useMemo(() =>
    parseHedgeActions(hedgeResult, hedge1, hedge2, h1Greeks, h2Greeks, spotPrice),
  [hedgeResult, hedge1, hedge2, h1Greeks, h2Greeks, spotPrice]);

  // Baselines at current params
  const baselines = useMemo(() => {
    const origBase = evalPortfolio(positions, spotPrice, T, r, 0);
    const hedgedBase = hasHedge
      ? evalHedged(origBase, hedge.legs, hedge.sharesDir, hedge.sharesQty, spotPrice, T, r, 0)
      : 0;
    return { origBase, hedgedBase };
  }, [positions, spotPrice, T, r, hasHedge, hedge]);

  // 1) P&L vs Price (Delta / Gamma)
  const priceData = useMemo(() => {
    const pad = spotPrice * 0.15;
    const lo = spotPrice - pad, hi = spotPrice + pad;
    const data: { x: number; pnl: number; series: string }[] = [];
    for (let i = 0; i <= 150; i++) {
      const S = lo + (hi - lo) * (i / 150);
      const origVal = evalPortfolio(positions, S, T, r, 0);
      data.push({ x: S, pnl: origVal - baselines.origBase, series: 'Original' });
      if (hasHedge) {
        const hedgedVal = evalHedged(origVal, hedge.legs, hedge.sharesDir, hedge.sharesQty, S, T, r, 0);
        data.push({ x: S, pnl: hedgedVal - baselines.hedgedBase, series: 'Hedged' });
      }
    }
    return data;
  }, [positions, spotPrice, T, r, baselines, hasHedge, hedge]);

  // 2) P&L vs IV shift (Vega)
  const vegaData = useMemo(() => {
    const data: { x: number; pnl: number; series: string }[] = [];
    for (let i = -20; i <= 20; i++) {
      const dSigma = i / 100;
      const origVal = evalPortfolio(positions, spotPrice, T, r, dSigma);
      data.push({ x: i, pnl: origVal - baselines.origBase, series: 'Original' });
      if (hasHedge) {
        const hedgedVal = evalHedged(origVal, hedge.legs, hedge.sharesDir, hedge.sharesQty, spotPrice, T, r, dSigma);
        data.push({ x: i, pnl: hedgedVal - baselines.hedgedBase, series: 'Hedged' });
      }
    }
    return data;
  }, [positions, spotPrice, T, r, baselines, hasHedge, hedge]);

  // 3) P&L vs Time passing (Theta)
  const thetaData = useMemo(() => {
    const maxDays = Math.min(Math.floor(T * 365) - 1, 60);
    if (maxDays < 1) return [];
    const data: { x: number; pnl: number; series: string }[] = [];
    for (let d = 0; d <= maxDays; d++) {
      const newT = T - d / 365;
      if (newT <= 0) break;
      const origVal = evalPortfolio(positions, spotPrice, newT, r, 0);
      data.push({ x: d, pnl: origVal - baselines.origBase, series: 'Original' });
      if (hasHedge) {
        const hedgedVal = evalHedged(origVal, hedge.legs, hedge.sharesDir, hedge.sharesQty, spotPrice, newT, r, 0);
        data.push({ x: d, pnl: hedgedVal - baselines.hedgedBase, series: 'Hedged' });
      }
    }
    return data;
  }, [positions, spotPrice, T, r, baselines, hasHedge, hedge]);

  // 4) P&L vs Rate shift (Rho)
  const rhoData = useMemo(() => {
    const data: { x: number; pnl: number; series: string }[] = [];
    for (let i = -30; i <= 30; i++) {
      const dr = i / 1000;
      const newR = Math.max(0, r + dr);
      const origVal = evalPortfolio(positions, spotPrice, T, newR, 0);
      data.push({ x: i / 10, pnl: origVal - baselines.origBase, series: 'Original' });
      if (hasHedge) {
        const hedgedVal = evalHedged(origVal, hedge.legs, hedge.sharesDir, hedge.sharesQty, spotPrice, T, newR, 0);
        data.push({ x: i / 10, pnl: hedgedVal - baselines.hedgedBase, series: 'Hedged' });
      }
    }
    return data;
  }, [positions, spotPrice, T, r, baselines, hasHedge, hedge]);

  // 5) Delta vs Price (Gamma visualization)
  const gammaData = useMemo(() => {
    const pad = spotPrice * 0.15;
    const lo = spotPrice - pad, hi = spotPrice + pad;
    const data: { x: number; delta: number; series: string }[] = [];
    for (let i = 0; i <= 150; i++) {
      const S = lo + (hi - lo) * (i / 150);
      let origDelta = 0;
      for (const p of positions) {
        const g = bsGreeks(p.optType, S, p.K, T, r, p.sigma);
        const dir = p.side === 'long' ? 1 : -1;
        origDelta += g.delta * dir * p.qty * 100;
      }
      data.push({ x: S, delta: origDelta, series: 'Original' });
      if (hasHedge) {
        let hedgedDelta = origDelta + hedge.sharesDir * hedge.sharesQty;
        for (const leg of hedge.legs) {
          const g = bsGreeks(leg.optType, S, leg.K, T, r, leg.sigma);
          hedgedDelta += g.delta * leg.contracts * 100;
        }
        data.push({ x: S, delta: hedgedDelta, series: 'Hedged' });
      }
    }
    return data;
  }, [positions, spotPrice, T, r, hasHedge, hedge]);

  const colorScale = {
    field: 'series', type: 'nominal' as const,
    scale: { domain: ['Original', 'Hedged'], range: ['#f87171', '#4ade80'] },
  };
  const dashScale = {
    field: 'series', type: 'nominal' as const,
    scale: { domain: ['Original', 'Hedged'], range: [[], [6, 4]] },
  };

  function makeSpec(title: string, data: any[], xField: string, xTitle: string, yField: string, yTitle: string, refX?: number) {
    const layers: any[] = [
      {
        data: { values: data },
        mark: { type: 'line', strokeWidth: 2 },
        encoding: {
          x: { field: xField, type: 'quantitative', title: xTitle },
          y: { field: yField, type: 'quantitative', title: yTitle },
          color: colorScale,
          strokeDash: dashScale,
        },
      },
      {
        data: { values: [{ z: 0 }] },
        mark: { type: 'rule', strokeDash: [4, 4], color: 'gray', opacity: 0.4 },
        encoding: { y: { datum: 0, type: 'quantitative' } },
      },
    ];
    if (refX !== undefined) {
      layers.push({
        data: { values: [{ ref: refX }] },
        mark: { type: 'rule', color: '#a78bfa', strokeWidth: 1.5, strokeDash: [3, 3] },
        encoding: { x: { field: 'ref', type: 'quantitative' } },
      });
    }
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 240,
      padding: { left: 10, right: 20, top: 10, bottom: 10 },
      title: { text: title, anchor: 'middle' as const },
      layer: layers,
    };
  }

  const priceSpec = useMemo(() => makeSpec(
    'P&L vs. Price (Delta)', priceData, 'x', 'Underlying Price ($)', 'pnl', 'P&L ($)', spotPrice,
  ), [priceData, spotPrice]);

  const gammaSpec = useMemo(() => makeSpec(
    'Delta vs. Price (Gamma)', gammaData, 'x', 'Underlying Price ($)', 'delta', 'Portfolio Delta', spotPrice,
  ), [gammaData, spotPrice]);

  const vegaSpec = useMemo(() => makeSpec(
    'P&L vs. IV Change (Vega)', vegaData, 'x', 'IV Shift (%)', 'pnl', 'P&L ($)',
  ), [vegaData]);

  const thetaSpec = useMemo(() => makeSpec(
    'P&L vs. Days Passed (Theta)', thetaData, 'x', 'Days Elapsed', 'pnl', 'P&L ($)',
  ), [thetaData]);

  const rhoSpec = useMemo(() => makeSpec(
    'P&L vs. Rate Change (Rho)', rhoData, 'x', 'Rate Shift (%)', 'pnl', 'P&L ($)',
  ), [rhoData]);

  return (
    <Card>
      <Heading size="xs" color={headingColor} mb={1}>
        Sensitivity Analysis {hasHedge ? '(Original vs. Hedged)' : ''}
      </Heading>
      <Text fontSize="xs" color="gray.400" mb={3}>
        Each chart varies one factor while holding others constant.
        {hasHedge ? '' : ' Run a hedge to see the comparison.'}
      </Text>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={4}>
        <VegaProvider><VegaPlot spec={priceSpec} height="260px" /></VegaProvider>
        <VegaProvider><VegaPlot spec={gammaSpec} height="260px" /></VegaProvider>
        <VegaProvider><VegaPlot spec={vegaSpec} height="260px" /></VegaProvider>
        <VegaProvider><VegaPlot spec={thetaSpec} height="260px" /></VegaProvider>
        <VegaProvider><VegaPlot spec={rhoSpec} height="260px" /></VegaProvider>
      </Grid>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function OptionsPage() {
  const navigate = useNavigate();

  return (
    <Box p={{ base: 2, md: 4 }} maxW="1400px" mx="auto">
      <Flex align="center" mb={4} gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={18} />
        </Button>
        <Heading size="lg" color={headingColor}>Options Strategies &amp; Greeks</Heading>
      </Flex>

      {/* Black-Scholes + Greeks reference */}
      <Flex gap={4} mb={6} wrap="wrap">
        <BlackScholesReference />
        <GreeksDigest />
      </Flex>

      {/* Strategy Tabs */}
      <Tabs.Root defaultValue="builder" lazyMount unmountOnExit>
        <Tabs.List mb={4}>
          <Tabs.Trigger value="builder">Strategy Builder</Tabs.Trigger>
          <Tabs.Trigger value="portfolio">Portfolio Greeks</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="builder"><StrategyBuilderTab /></Tabs.Content>
        <Tabs.Content value="portfolio"><PortfolioGreeksTab /></Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
