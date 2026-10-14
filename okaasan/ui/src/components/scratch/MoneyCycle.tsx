import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Button, Flex, Grid, Heading, HStack, Input, Text, Textarea, VStack, Badge, Table,
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsonStore, isStaticMode } from '../../services/jsonstore';
import {
  Save, FolderOpen, Plus, Trash2, ChevronRight, CheckCircle2, Circle, ExternalLink,
} from 'lucide-react';

// Due-diligence counterpart of ResourceCycle: the company is drawn as the loop
// that turns capital into revenue and back into cash. Every research question,
// metric and piece of evidence hangs off one node of that loop; evidence that
// cannot be attached to a node is kept in an "off-cycle" bucket so noise stays
// visible as noise instead of mixing with relevant findings.

// ── Types ──────────────────────────────────────────────────

/** One line in a node's money breakdown (graph shows the rolled-up total). */
export interface AmountLine {
  id?: string;
  label: string;
  amount: number;
  note?: string;
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  note?: string;
}

export interface Question {
  id: string;
  text: string;
  answer: string;
}

export interface CycleNode {
  id: string;
  label: string;
  summary: string;
  details: string;
  /** Cash effect for the period, signed: + into the company, − out. Capital = balance. */
  amount: number | null;
  amount_lines?: AmountLine[];
  metrics: Metric[];
  questions: Question[];
  sources: string[];
  risks: string[];
}

export interface CycleEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  path?: 'cycle' | 'invest' | 'entry' | 'exit' | 'demand';
  /** Money moving along this arrow (same unit as the company); sizes the stroke. */
  flow?: number | null;
  note?: string;
}

export type Signal = 'pos' | 'neg' | 'neu';

export interface Evidence {
  id: string;
  /** Node id this item informs; '' = does not touch the cycle. */
  node: string;
  date: string;
  title: string;
  source: string;
  url?: string;
  note: string;
  signal: Signal;
}

export interface MoneyCycleCompany {
  name: string;
  ticker: string;
  description: string;
  /** e.g. "USD M" */
  unit: string;
  /** e.g. "FY2025" */
  period: string;
  nodes: CycleNode[];
  edges: CycleEdge[];
  evidence: Evidence[];
}

const COLLECTION = 'money-cycle';
const BASE = '/scratch/money-cycle';

const PATH_COLORS: Record<string, string> = {
  cycle: 'var(--icon-color)',
  invest: 'var(--panel-orange-text)',
  entry: 'var(--panel-green-text)',
  exit: 'var(--panel-red-text)',
  demand: 'var(--panel-blue-text)',
};

const NODE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  market: { color: 'var(--panel-blue-text)', bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
  sell: { color: 'var(--panel-blue-text)', bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
  collect: { color: 'var(--panel-teal-text)', bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
  capital: { color: 'var(--heading-color)', bg: 'var(--card-bg)', border: 'var(--border-color)' },
  supply: { color: 'var(--panel-purple-text)', bg: 'var(--panel-purple-bg)', border: 'var(--panel-purple-border)' },
  operate: { color: 'var(--panel-purple-text)', bg: 'var(--panel-purple-bg)', border: 'var(--panel-purple-border)' },
  invest: { color: 'var(--panel-orange-text)', bg: 'var(--panel-orange-bg)', border: 'var(--panel-orange-border)' },
  funding: { color: 'var(--panel-green-text)', bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)' },
  taxes: { color: 'var(--panel-red-text)', bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)' },
  returns: { color: 'var(--panel-red-text)', bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)' },
};

const DEFAULT_STYLE = { color: 'var(--heading-color)', bg: 'var(--card-bg)', border: 'var(--border-color)' };

function nodeStyle(id: string) {
  return NODE_STYLE[id] || DEFAULT_STYLE;
}

const SIGNAL_COLORS: Record<Signal, string> = {
  pos: 'var(--panel-green-text)',
  neg: 'var(--panel-red-text)',
  neu: 'var(--muted-text)',
};

const SIGNAL_LABELS: Record<Signal, string> = { pos: 'Positive', neg: 'Negative', neu: 'Neutral' };

// ── Template ───────────────────────────────────────────────

type NodeTemplate = {
  label: string;
  summary: string;
  metrics: string[];
  questions: string[];
  sources: string[];
  risks: string[];
};

const TEMPLATE: Record<string, NodeTemplate> = {
  market: {
    label: 'Market',
    summary: 'Who pays, how many of them, and why',
    metrics: ['Market size', 'Market growth', 'Market share', 'Top-10 customer share'],
    questions: [
      'Who is the paying customer, and is it the same as the user?',
      'How large is the addressable market and how fast is it growing?',
      'How concentrated are customers (share of revenue from the top 10)?',
      'What triggers a purchase, and how often does it repeat?',
      'Who else competes for the same budget, including substitutes?',
    ],
    sources: ['10-K business section', 'industry reports', 'competitor filings', 'customer reviews'],
    risks: ['demand cyclicality', 'substitution', 'customer concentration'],
  },
  sell: {
    label: 'Sell',
    summary: 'Turning demand into booked revenue',
    metrics: ['Revenue growth', 'Recurring share', 'Price change', 'Retention / churn', 'CAC payback'],
    questions: [
      'How is price set, and who has pricing power?',
      'What share of revenue is recurring vs one-off?',
      'What does a customer cost to acquire, and how long do they stay?',
      'Which channels carry the volume (direct, distributors, platforms)?',
      'How does revenue split by segment and geography?',
    ],
    sources: ['segment reporting', 'earnings call transcripts', 'pricing pages', 'channel partner disclosures'],
    risks: ['price war', 'channel dependence', 'churn'],
  },
  collect: {
    label: 'Collect',
    summary: 'Turning revenue into cash',
    metrics: ['DSO', 'Deferred revenue', 'Receivables growth vs revenue', 'Bad-debt provision'],
    questions: [
      'How long between delivery and cash (DSO)?',
      'Do customers pay upfront, on delivery, or on credit?',
      'Are receivables growing faster than revenue?',
      'Any factoring, unusual payment terms, or aggressive revenue recognition?',
    ],
    sources: ['balance sheet', 'cash flow statement', 'revenue recognition notes'],
    risks: ['credit losses', 'aggressive recognition'],
  },
  capital: {
    label: 'Capital',
    summary: 'Cash on hand and how the balance sheet is funded',
    metrics: ['Net debt', 'Net debt / EBITDA', 'Interest coverage', 'Liquidity runway'],
    questions: [
      'How much cash is on hand vs short-term obligations?',
      'How is the balance sheet funded (equity, debt, leases)?',
      'When does debt mature, and at what rate?',
      'What does management prioritise: reinvest, distribute, or acquire?',
    ],
    sources: ['balance sheet', 'debt footnotes', 'credit ratings', 'capital allocation statements'],
    risks: ['refinancing wall', 'covenant breach', 'dilution'],
  },
  supply: {
    label: 'Supply',
    summary: 'Inputs bought to make the product',
    metrics: ['Gross margin', 'DIO', 'DPO', 'Top supplier share'],
    questions: [
      'What are the main inputs, and what share of COGS is each?',
      'How many suppliers per critical input? Any single source?',
      'Who has bargaining power, the supplier or the company?',
      'How long does inventory sit (DIO), and how long until suppliers are paid (DPO)?',
      'Can input cost increases be passed through to price?',
    ],
    sources: ['supplier filings listing this customer', 'customs / import records', 'commodity prices', 'inventory notes'],
    risks: ['input inflation', 'single source', 'geopolitical exposure'],
  },
  operate: {
    label: 'Operate',
    summary: 'People and capacity that turn inputs into the product',
    metrics: ['Operating margin', 'Utilisation', 'Headcount', 'Revenue / employee'],
    questions: [
      'Which costs are fixed and which vary with volume?',
      'Where is the capacity, and how utilised is it?',
      'What does one unit cost to produce or serve, and is it falling?',
      'How many people, and how much revenue per employee?',
      'What in operations is hard to copy (scale, process, IP)?',
    ],
    sources: ['10-K properties & employees', 'job postings', 'site / plant disclosures', 'employee reviews'],
    risks: ['operating leverage', 'labour disputes', 'outages'],
  },
  invest: {
    label: 'Invest',
    summary: 'Capex, R&D and acquisitions that build future capacity',
    metrics: ['Capex / revenue', 'R&D', 'ROIC', 'Acquisitions'],
    questions: [
      'How much is maintenance capex vs growth capex?',
      'What returns do past investments earn (ROIC)?',
      'What is in the pipeline, and when does it reach Operate?',
      'Acquisition track record: price paid vs value created?',
    ],
    sources: ['cash flow statement', 'investor day presentations', 'patent filings', 'M&A announcements'],
    risks: ['overinvestment', 'failed integration', 'stranded assets'],
  },
  taxes: {
    label: 'Taxes',
    summary: 'What government and regulators take',
    metrics: ['Effective tax rate', 'Subsidies / credits'],
    questions: [
      'What is the effective tax rate vs the statutory rate?',
      'Where are profits booked vs where are customers?',
      'Any dependence on subsidies, credits, or permits?',
      'Pending disputes, fines, or regulation changes?',
    ],
    sources: ['tax footnote', 'regulatory filings', 'litigation notes'],
    risks: ['tax regime change', 'regulation', 'fines'],
  },
  returns: {
    label: 'Returns',
    summary: 'Cash paid back to owners and lenders',
    metrics: ['Dividends', 'Buybacks', 'Interest paid', 'Payout / FCF', 'Insider ownership'],
    questions: [
      'How much of free cash flow goes back to owners and lenders?',
      'Are buybacks done above or below intrinsic value?',
      'Is the dividend covered by free cash flow?',
      'Who owns the company, and what are insiders doing?',
    ],
    sources: ['proxy statement', 'insider transaction filings', 'cash flow statement'],
    risks: ['debt-funded payouts', 'insider selling'],
  },
  funding: {
    label: 'Funding',
    summary: 'New money from equity and debt markets',
    metrics: ['Debt issued', 'Equity issued', 'Share count change', 'Cost of debt'],
    questions: [
      'How often does the company raise money, and on what terms?',
      'Is growth self-funded or dependent on capital markets?',
      'Is the share count growing (dilution) or shrinking?',
      'Who are the lenders, and what covenants apply?',
    ],
    sources: ['prospectuses', 'material event filings', 'credit agreements', 'share count history'],
    risks: ['closed capital markets', 'dilution', 'rising rates'],
  },
};

const NODE_ORDER = ['market', 'sell', 'collect', 'capital', 'supply', 'operate', 'invest', 'taxes', 'returns', 'funding'];

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function templateNode(id: string): CycleNode {
  const t = TEMPLATE[id];
  return {
    id,
    label: t?.label || id,
    summary: t?.summary || '',
    details: '',
    amount: null,
    amount_lines: [],
    metrics: (t?.metrics || []).map((label, i) => ({ id: `${id}-m${i}`, label, value: '' })),
    questions: (t?.questions || []).map((text, i) => ({ id: `${id}-q${i}`, text, answer: '' })),
    sources: [...(t?.sources || [])],
    risks: [...(t?.risks || [])],
  };
}

function defaultEdges(): CycleEdge[] {
  return [
    { id: 'e-cap-sup', from: 'capital', to: 'supply', label: 'pay', path: 'cycle' },
    { id: 'e-sup-op', from: 'supply', to: 'operate', label: 'build', path: 'cycle' },
    { id: 'e-op-sell', from: 'operate', to: 'sell', label: 'deliver', path: 'cycle' },
    { id: 'e-sell-col', from: 'sell', to: 'collect', label: 'bill', path: 'cycle' },
    { id: 'e-col-cap', from: 'collect', to: 'capital', label: 'cash', path: 'cycle' },
    { id: 'e-cap-inv', from: 'capital', to: 'invest', label: 'capex', path: 'invest' },
    { id: 'e-inv-op', from: 'invest', to: 'operate', label: 'capacity', path: 'invest' },
    { id: 'e-fund-cap', from: 'funding', to: 'capital', label: 'raise', path: 'entry' },
    { id: 'e-cap-ret', from: 'capital', to: 'returns', label: 'distribute', path: 'exit' },
    { id: 'e-op-tax', from: 'operate', to: 'taxes', label: 'tax', path: 'exit' },
    { id: 'e-mkt-sell', from: 'market', to: 'sell', label: 'demand', path: 'demand' },
  ];
}

function defaultCompany(): MoneyCycleCompany {
  return {
    name: '',
    ticker: '',
    description: '',
    unit: 'USD M',
    period: '',
    nodes: NODE_ORDER.map(templateNode),
    edges: defaultEdges(),
    evidence: [],
  };
}

function normalizeCompany(data: Partial<MoneyCycleCompany>, fallbackName: string): MoneyCycleCompany {
  const base = defaultCompany();
  const loaded = new Map((data.nodes || []).map((n) => [n.id, n]));
  // Template nodes are always present so every company is read through the same cycle.
  const ids = [...NODE_ORDER, ...[...loaded.keys()].filter((id) => !NODE_ORDER.includes(id))];
  const nodes = ids.map((id) => {
    const n: Partial<CycleNode> = loaded.get(id) || {};
    const t = templateNode(id);
    return {
      id,
      label: n.label || t.label,
      summary: n.summary ?? t.summary,
      details: n.details || '',
      amount: typeof n.amount === 'number' ? n.amount : null,
      amount_lines: Array.isArray(n.amount_lines)
        ? n.amount_lines.map((l, i) => ({
          id: l.id || `line-${i}`,
          label: l.label || `Line ${i + 1}`,
          amount: typeof l.amount === 'number' ? l.amount : 0,
          note: l.note || '',
        }))
        : [],
      metrics: Array.isArray(n.metrics)
        ? n.metrics.map((m, i) => ({ id: m.id || `${id}-m${i}`, label: m.label || '', value: m.value ?? '', note: m.note || '' }))
        : t.metrics,
      questions: Array.isArray(n.questions)
        ? n.questions.map((q, i) => ({ id: q.id || `${id}-q${i}`, text: q.text || '', answer: q.answer || '' }))
        : t.questions,
      sources: n.sources || t.sources,
      risks: n.risks || t.risks,
    };
  });

  const loadedEdges = new Map((data.edges || []).map((e) => [e.id, e]));
  const edges = base.edges.map((e) => {
    const l = loadedEdges.get(e.id);
    return l
      ? { ...e, label: l.label ?? e.label, flow: typeof l.flow === 'number' ? l.flow : null, note: l.note || '' }
      : e;
  });

  return {
    name: data.name || fallbackName,
    ticker: data.ticker || '',
    description: data.description || '',
    unit: data.unit || base.unit,
    period: data.period || '',
    nodes,
    edges,
    evidence: (data.evidence || []).map((ev) => ({
      id: ev.id || newId('ev'),
      node: ev.node || '',
      date: ev.date || '',
      title: ev.title || '',
      source: ev.source || '',
      url: ev.url || '',
      note: ev.note || '',
      signal: ev.signal === 'pos' || ev.signal === 'neg' ? ev.signal : 'neu',
    })),
  };
}

// ── Helpers ────────────────────────────────────────────────

function tagsToString(tags: string[]): string {
  return tags.join(', ');
}

function stringToTags(value: string): string[] {
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

function nodeAmount(n: CycleNode | undefined): number | null {
  if (!n) return null;
  if (typeof n.amount === 'number' && !Number.isNaN(n.amount)) return n.amount;
  const lines = n.amount_lines || [];
  if (lines.length === 0) return null;
  return lines.reduce((s, l) => s + (l.amount || 0), 0);
}

function formatMoney(v: number | null | undefined, signed = true): string {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  const body = abs.toLocaleString(undefined, { maximumFractionDigits: abs >= 100 ? 0 : 1 });
  if (!signed) return (v < 0 ? '−' : '') + body;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + body;
}

function formatPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function questionCoverage(n: CycleNode): { answered: number; total: number } {
  const total = n.questions.length;
  const answered = n.questions.filter((q) => q.answer.trim()).length;
  return { answered, total };
}

// ── Cash walk ──────────────────────────────────────────────

type WalkRow = { key: string; label: string; value: number | null; subtotal?: boolean; node?: string };

function buildCashWalk(nodes: CycleNode[]): { rows: WalkRow[]; revenue: number | null } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const v = (id: string) => nodeAmount(byId.get(id));
  const sum = (...xs: (number | null)[]) => {
    const present = xs.filter((x): x is number => typeof x === 'number');
    return present.length ? present.reduce((a, b) => a + b, 0) : null;
  };

  const revenue = v('sell');
  const cogs = v('supply');
  const gross = sum(revenue, cogs);
  const opex = v('operate');
  const operating = sum(gross, opex);
  const taxes = v('taxes');
  const wc = v('collect');
  const ocf = sum(operating, taxes, wc);
  const invest = v('invest');
  const fcf = sum(ocf, invest);
  const returns = v('returns');
  const funding = v('funding');
  const net = sum(fcf, returns, funding);

  return {
    revenue,
    rows: [
      { key: 'sell', node: 'sell', label: 'Revenue', value: revenue },
      { key: 'supply', node: 'supply', label: 'Cost of goods', value: cogs },
      { key: 'gross', label: 'Gross profit', value: gross, subtotal: true },
      { key: 'operate', node: 'operate', label: 'Operating costs', value: opex },
      { key: 'opprofit', label: 'Operating profit', value: operating, subtotal: true },
      { key: 'taxes', node: 'taxes', label: 'Taxes', value: taxes },
      { key: 'collect', node: 'collect', label: 'Working capital', value: wc },
      { key: 'ocf', label: 'Operating cash flow', value: ocf, subtotal: true },
      { key: 'invest', node: 'invest', label: 'Investment', value: invest },
      { key: 'fcf', label: 'Free cash flow', value: fcf, subtotal: true },
      { key: 'returns', node: 'returns', label: 'Returns to owners & lenders', value: returns },
      { key: 'funding', node: 'funding', label: 'New funding', value: funding },
      { key: 'net', label: 'Change in cash', value: net, subtotal: true },
    ],
  };
}

const CashWalk: React.FC<{
  nodes: CycleNode[];
  unit: string;
  period: string;
  onSelectNode: (id: string) => void;
}> = ({ nodes, unit, period, onSelectNode }) => {
  const { rows, revenue } = useMemo(() => buildCashWalk(nodes), [nodes]);

  return (
    <Box
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      bg="var(--card-bg)"
      overflowX="auto"
      h="100%"
    >
      <HStack px={4} pt={3} pb={2} justify="space-between">
        <Heading size="sm" color="var(--heading-color)">Cash walk</Heading>
        <Text fontSize="xs" color="var(--muted-text)">{[period, unit].filter(Boolean).join(' · ')}</Text>
      </HStack>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader minW="180px">Step</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">{unit || 'Amount'}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">% revenue</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const pct = revenue && row.value != null ? (row.value / revenue) * 100 : null;
            const color = row.node ? nodeStyle(row.node).color : 'var(--heading-color)';
            return (
              <Table.Row
                key={row.key}
                bg={row.subtotal ? 'var(--surface-muted)' : undefined}
                cursor={row.node ? 'pointer' : 'default'}
                _hover={row.node ? { bg: 'var(--hover-bg)' } : undefined}
                onClick={() => { if (row.node) onSelectNode(row.node); }}
              >
                <Table.Cell
                  fontSize="sm"
                  fontWeight={row.subtotal ? '700' : '500'}
                  color={row.subtotal ? 'var(--heading-color)' : color}
                  pl={row.subtotal ? 3 : 6}
                >
                  {row.label}
                </Table.Cell>
                <Table.Cell
                  textAlign="right"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight={row.subtotal ? '700' : '500'}
                  color={row.value != null && row.value < 0 ? 'var(--panel-red-text)' : 'var(--heading-color)'}
                >
                  {formatMoney(row.value)}
                </Table.Cell>
                <Table.Cell textAlign="right" fontFamily="mono" fontSize="xs" color="var(--muted-text)">
                  {row.key === 'sell' ? '' : formatPct(pct)}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

// ── Graph layout + SVG ─────────────────────────────────────

const NODE_W = 136;
const NODE_H = 62;
const GRAPH_W = 760;
const GRAPH_H = 600;
const RING = { cx: 380, cy: 290, rx: 240, ry: 195 };

/** Ring nodes sit on an ellipse, clockwise on screen (y grows downward). */
const RING_ANGLES: Record<string, number> = {
  capital: 180,
  supply: 252,
  operate: 324,
  sell: 36,
  collect: 108,
};

const FIXED_CENTERS: Record<string, { x: number; y: number }> = {
  invest: { x: RING.cx, y: RING.cy },
  funding: { x: 88, y: 50 },
  taxes: { x: GRAPH_W - 88, y: 50 },
  returns: { x: 88, y: GRAPH_H - 50 },
  market: { x: GRAPH_W - 88, y: GRAPH_H - 50 },
};

function ellipsePoint(deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: RING.cx + RING.rx * Math.cos(a), y: RING.cy + RING.ry * Math.sin(a) };
}

function nodeCenter(id: string, index: number): { x: number; y: number } {
  if (id in RING_ANGLES) return ellipsePoint(RING_ANGLES[id]);
  if (id in FIXED_CENTERS) return FIXED_CENTERS[id];
  // Custom nodes go in a row along the bottom-center gap.
  return { x: 260 + (index % 3) * 120, y: GRAPH_H - 50 };
}

function insideRect(p: { x: number; y: number }, c: { x: number; y: number }, pad: number): boolean {
  return Math.abs(p.x - c.x) <= NODE_W / 2 + pad && Math.abs(p.y - c.y) <= NODE_H / 2 + pad;
}

/** Point where the segment from c toward target leaves the node rectangle around c. */
function rectExit(c: { x: number; y: number }, target: { x: number; y: number }, pad: number) {
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const hw = NODE_W / 2 + pad;
  const hh = NODE_H / 2 + pad;
  const t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

type Pt = { x: number; y: number };

function toPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function ringArc(fromId: string, toId: string): Pt[] | null {
  const a0 = RING_ANGLES[fromId];
  let a1 = RING_ANGLES[toId];
  if (a0 == null || a1 == null) return null;
  while (a1 <= a0) a1 += 360;
  const c0 = ellipsePoint(a0);
  const c1 = ellipsePoint(a1);
  const pts: { x: number; y: number }[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const p = ellipsePoint(a0 + ((a1 - a0) * i) / steps);
    if (insideRect(p, c0, 4) || insideRect(p, c1, 6)) continue;
    pts.push(p);
  }
  return pts.length < 2 ? null : pts;
}

function straightPath(a: Pt, b: Pt): Pt[] {
  return [rectExit(a, b, 2), rectExit(b, a, 6)];
}

const MoneyGraph: React.FC<{
  nodes: CycleNode[];
  edges: CycleEdge[];
  evidence: Evidence[];
  selected: string;
  onSelect: (id: string) => void;
}> = ({ nodes, edges, evidence, selected, onSelect }) => {
  const centers = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    let custom = 0;
    for (const n of nodes) {
      const known = n.id in RING_ANGLES || n.id in FIXED_CENTERS;
      m.set(n.id, nodeCenter(n.id, known ? 0 : custom++));
    }
    return m;
  }, [nodes]);

  const maxFlow = useMemo(
    () => Math.max(0, ...edges.map((e) => Math.abs(e.flow ?? 0))),
    [edges],
  );

  const strokeWidth = (flow: number | null | undefined) => {
    if (flow == null || maxFlow === 0) return 2;
    return 1.5 + 6 * (Math.abs(flow) / maxFlow);
  };

  const evidenceByNode = useMemo(() => {
    const m = new Map<string, { pos: number; neg: number; neu: number }>();
    for (const ev of evidence) {
      if (!ev.node) continue;
      const c = m.get(ev.node) || { pos: 0, neg: 0, neu: 0 };
      c[ev.signal] += 1;
      m.set(ev.node, c);
    }
    return m;
  }, [evidence]);

  const edgePoints = (e: CycleEdge): Pt[] | null => {
    if (e.path === 'cycle') {
      const arc = ringArc(e.from, e.to);
      if (arc) return arc;
    }
    const a = centers.get(e.from);
    const b = centers.get(e.to);
    if (!a || !b) return null;
    return straightPath(a, b);
  };

  return (
    <Box
      overflowX="auto"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      bg="var(--surface-muted)"
      p={2}
    >
      <svg
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        width="100%"
        style={{ display: 'block', minWidth: 560, maxHeight: '75vh' }}
      >
        <defs>
          {Object.entries(PATH_COLORS).map(([kind, color]) => (
            <marker
              key={kind}
              id={`mc-arrow-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {edges.map((e) => {
          const kind = e.path || 'cycle';
          const pts = edgePoints(e);
          if (!pts) return null;
          const d = toPath(pts);
          // Labels follow a left-to-right copy of the path so they never render upside down.
          const flip = pts[pts.length - 1].x < pts[0].x;
          const pathId = `mc-edge-${e.id}`;
          const labelId = flip ? `mc-label-${e.id}` : pathId;
          const text = [e.label, e.flow != null ? formatMoney(e.flow, false) : null].filter(Boolean).join(' ');
          return (
            <g key={e.id}>
              {flip && <path id={labelId} d={toPath([...pts].reverse())} fill="none" stroke="none" />}
              <path
                id={pathId}
                d={d}
                fill="none"
                stroke={PATH_COLORS[kind]}
                strokeWidth={strokeWidth(e.flow)}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={`url(#mc-arrow-${kind})`}
                opacity={0.85}
              >
                {e.note && <title>{e.note}</title>}
              </path>
              {text && (
                <text fontSize="10" fill={PATH_COLORS[kind]} fontWeight="600" dy={-6} style={{ pointerEvents: 'none' }}>
                  <textPath href={`#${labelId}`} startOffset="50%" textAnchor="middle">{text}</textPath>
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const c = centers.get(n.id);
          if (!c) return null;
          const isSel = selected === n.id;
          const st = nodeStyle(n.id);
          const amt = nodeAmount(n);
          const { answered, total } = questionCoverage(n);
          const frac = total ? answered / total : 0;
          const ev = evidenceByNode.get(n.id);
          const barW = NODE_W - 24;
          return (
            <g
              key={n.id}
              transform={`translate(${c.x - NODE_W / 2}, ${c.y - NODE_H / 2})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(n.id)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isSel ? st.bg : 'var(--card-bg)'}
                stroke={isSel ? st.color : st.border}
                strokeWidth={isSel ? 2.25 : 1.25}
              />
              <text x={NODE_W / 2} y={19} textAnchor="middle" fontSize="12" fontWeight="700" fill={st.color}>
                {n.label}
              </text>
              <text
                x={NODE_W / 2}
                y={36}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={amt != null && amt < 0 ? 'var(--panel-red-text)' : 'var(--muted-text)'}
              >
                {formatMoney(amt, n.id !== 'capital' && n.id !== 'market')}
              </text>
              {ev && (
                <text x={NODE_W - 6} y={12} textAnchor="end" fontSize="9" fontWeight="700">
                  {ev.pos > 0 && <tspan fill={SIGNAL_COLORS.pos}>+{ev.pos} </tspan>}
                  {ev.neg > 0 && <tspan fill={SIGNAL_COLORS.neg}>−{ev.neg} </tspan>}
                  {ev.neu > 0 && <tspan fill={SIGNAL_COLORS.neu}>·{ev.neu}</tspan>}
                </text>
              )}
              <rect x={12} y={46} width={barW} height={4} rx={2} fill="var(--border-color)" />
              {frac > 0 && <rect x={12} y={46} width={barW * frac} height={4} rx={2} fill={st.color} />}
              <text x={NODE_W / 2} y={59} textAnchor="middle" fontSize="8" fill="var(--empty-text)">
                {answered}/{total}
              </text>
              {n.summary && <title>{n.summary}</title>}
            </g>
          );
        })}
      </svg>

      <HStack gap={4} px={3} pb={2} flexWrap="wrap" align="center">
        {(
          [
            ['cycle', 'Operating loop'],
            ['invest', 'Reinvestment'],
            ['entry', 'Funding in'],
            ['exit', 'Cash out'],
            ['demand', 'Demand'],
          ] as const
        ).map(([kind, label]) => (
          <HStack key={kind} gap={1.5}>
            <Box w="18px" h="0" borderTop="2.5px solid" borderColor={PATH_COLORS[kind]} />
            <Text fontSize="2xs" color="var(--muted-text)">{label}</Text>
          </HStack>
        ))}
        <Text fontSize="2xs" color="var(--empty-text)" ml="auto">
          bar = questions answered · arrow width = flow
        </Text>
      </HStack>
    </Box>
  );
};

// ── Evidence ───────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  backgroundColor: 'var(--input-bg)',
  color: 'var(--heading-color)',
  fontSize: '13px',
};

const EvidenceRow: React.FC<{
  ev: Evidence;
  nodes: CycleNode[];
  showNode: boolean;
  editable: boolean;
  onChange: (patch: Partial<Evidence>) => void;
  onRemove: () => void;
  onSelectNode: (id: string) => void;
}> = ({ ev, nodes, showNode, editable, onChange, onRemove, onSelectNode }) => {
  const node = nodes.find((n) => n.id === ev.node);
  return (
    <Box
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor="var(--border-color)"
      borderLeft="3px solid"
      borderLeftColor={SIGNAL_COLORS[ev.signal]}
      bg="var(--card-bg)"
    >
      <Flex gap={2} align="flex-start" wrap="wrap">
        <Box flex="1" minW="200px">
          <HStack gap={2} flexWrap="wrap">
            <Text fontSize="sm" fontWeight="600" color="var(--heading-color)">{ev.title || 'Untitled'}</Text>
            {ev.url && (
              <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: 'var(--muted-text)' }}>
                <ExternalLink size={12} />
              </a>
            )}
          </HStack>
          <Text fontSize="2xs" color="var(--muted-text)">
            {[ev.date, ev.source].filter(Boolean).join(' · ')}
          </Text>
          {ev.note && (
            <Text fontSize="xs" color="var(--heading-color)" mt={1} whiteSpace="pre-wrap">{ev.note}</Text>
          )}
        </Box>
        {editable ? (
          <HStack gap={1}>
            <select value={ev.node} onChange={(e) => onChange({ node: e.target.value })} style={selectStyle}>
              <option value="">Off-cycle</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            <select value={ev.signal} onChange={(e) => onChange({ signal: e.target.value as Signal })} style={selectStyle}>
              {(['pos', 'neu', 'neg'] as Signal[]).map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
            </select>
            <Button size="xs" variant="ghost" colorPalette="red" onClick={onRemove}>×</Button>
          </HStack>
        ) : showNode ? (
          <Badge
            variant="outline"
            cursor={node ? 'pointer' : 'default'}
            color={node ? nodeStyle(node.id).color : 'var(--empty-text)'}
            onClick={() => { if (node) onSelectNode(node.id); }}
          >
            {node ? node.label : 'Off-cycle'}
          </Badge>
        ) : null}
      </Flex>
    </Box>
  );
};

const emptyEvidence = (node: string): Evidence => ({
  id: '',
  node,
  date: new Date().toISOString().slice(0, 10),
  title: '',
  source: '',
  url: '',
  note: '',
  signal: 'neu',
});

const EvidenceForm: React.FC<{
  nodes: CycleNode[];
  defaultNode: string;
  onAdd: (ev: Evidence) => void;
}> = ({ nodes, defaultNode, onAdd }) => {
  const [draft, setDraft] = useState<Evidence>(emptyEvidence(defaultNode));
  useEffect(() => { setDraft((d) => ({ ...d, node: defaultNode })); }, [defaultNode]);
  const set = (patch: Partial<Evidence>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = () => {
    if (!draft.title.trim()) return;
    onAdd({ ...draft, id: newId('ev'), title: draft.title.trim() });
    setDraft(emptyEvidence(draft.node));
  };
  return (
    <VStack align="stretch" gap={2} p={3} borderRadius="md" border="1px dashed" borderColor="var(--border-color)">
      <Grid templateColumns={{ base: '1fr', md: '2fr 1fr 120px' }} gap={2}>
        <Input size="sm" placeholder="Finding" value={draft.title} onChange={(e) => set({ title: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
        <Input size="sm" placeholder="Source" value={draft.source} onChange={(e) => set({ source: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
        <Input size="sm" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
      </Grid>
      <Input size="sm" placeholder="URL" value={draft.url} onChange={(e) => set({ url: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
      <Textarea size="sm" rows={2} placeholder="What it changes in the cycle" value={draft.note} onChange={(e) => set({ note: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
      <HStack gap={2} flexWrap="wrap">
        <select value={draft.node} onChange={(e) => set({ node: e.target.value })} style={selectStyle}>
          <option value="">Off-cycle</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <select value={draft.signal} onChange={(e) => set({ signal: e.target.value as Signal })} style={selectStyle}>
          {(['pos', 'neu', 'neg'] as Signal[]).map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
        </select>
        <Button size="xs" colorPalette="blue" onClick={submit} disabled={!draft.title.trim()} ml="auto">
          <Plus size={12} /> Add finding
        </Button>
      </HStack>
    </VStack>
  );
};

// ── Main page ──────────────────────────────────────────────

const MoneyCycle: React.FC = () => {
  const { company: urlCompany } = useParams<{ company?: string }>();
  const navigate = useNavigate();

  const [storeKey, setStoreKey] = useState('');
  const [company, setCompany] = useState<MoneyCycleCompany | null>(null);
  const [selected, setSelected] = useState('sell');
  const [saved, setSaved] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState<string>('all');
  const creatingNew = useRef(false);

  const nodes = company?.nodes || [];
  const edges = company?.edges || [];
  const evidence = company?.evidence || [];
  const canEdit = !isStaticMode;

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selected) || nodes[0],
    [nodes, selected],
  );

  const flash = (msg: string, ms = 2500) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), ms);
  };

  const patchCompany = (patch: Partial<MoneyCycleCompany>) => {
    setCompany((c) => (c ? { ...c, ...patch } : c));
    setDirty(true);
  };

  const doLoad = useCallback(async (key: string) => {
    try {
      const data = await jsonStore.get<MoneyCycleCompany>(COLLECTION, key);
      setCompany(normalizeCompany(data, key));
      setStoreKey(key);
      setDirty(false);
      setEditing(false);
    } catch {
      flash('Load failed');
    }
  }, []);

  useEffect(() => {
    jsonStore.list(COLLECTION).then(setSaved).catch(() => { });
    if (urlCompany) {
      creatingNew.current = false;
      doLoad(urlCompany);
    } else if (creatingNew.current) {
      creatingNew.current = false;
    } else {
      setCompany(null);
      setStoreKey('');
      setDirty(false);
      setEditing(false);
    }
  }, [urlCompany, doLoad]);

  const save = async () => {
    if (!company) return;
    const name = (storeKey || company.ticker || company.name).trim();
    if (!name) return;
    const key = name.replace(/[^a-zA-Z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '') || name;
    try {
      await jsonStore.put(COLLECTION, key, { ...company, name: company.name.trim() || key });
      setStoreKey(key);
      setDirty(false);
      flash('Saved', 2000);
      if (!saved.includes(key)) setSaved((prev) => [...prev, key].sort());
      navigate(`${BASE}/${encodeURIComponent(key)}`, { replace: true });
    } catch {
      flash('Save failed');
    }
  };

  const newCompany = () => {
    // Leaving a /:company URL re-runs the load effect; the flag keeps it from clearing the template.
    creatingNew.current = !!urlCompany;
    setCompany(defaultCompany());
    setStoreKey('');
    setSelected('sell');
    setDirty(false);
    setEditing(true);
    navigate(BASE);
  };

  const remove = async () => {
    if (!storeKey || isStaticMode) return;
    if (!confirm(`Delete “${company?.name || storeKey}”?`)) return;
    try {
      await jsonStore.remove(COLLECTION, storeKey);
      setSaved((prev) => prev.filter((p) => p !== storeKey));
      navigate(BASE);
    } catch {
      flash('Delete failed');
    }
  };

  const updateNode = (patch: Partial<CycleNode>) => {
    if (!selectedNode || !company) return;
    patchCompany({ nodes: nodes.map((n) => (n.id === selectedNode.id ? { ...n, ...patch } : n)) });
  };

  const updateEdge = (id: string, patch: Partial<CycleEdge>) => {
    patchCompany({ edges: edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  const updateEvidence = (id: string, patch: Partial<Evidence>) => {
    patchCompany({ evidence: evidence.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)) });
  };

  const removeEvidence = (id: string) => {
    patchCompany({ evidence: evidence.filter((ev) => ev.id !== id) });
  };

  const addEvidence = (ev: Evidence) => {
    patchCompany({ evidence: [ev, ...evidence] });
  };

  const coverage = useMemo(() => {
    let answered = 0;
    let total = 0;
    for (const n of nodes) {
      const c = questionCoverage(n);
      answered += c.answered;
      total += c.total;
    }
    const onCycle = evidence.filter((ev) => ev.node).length;
    return { answered, total, onCycle, offCycle: evidence.length - onCycle };
  }, [nodes, evidence]);

  const headline = useMemo(() => {
    const { rows, revenue } = buildCashWalk(nodes);
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
    const pct = (v: number | null) => (revenue && v != null ? (v / revenue) * 100 : null);
    const op = get('opprofit');
    const ocf = get('ocf');
    return [
      { label: 'Revenue', value: formatMoney(revenue, false) },
      { label: 'Gross margin', value: formatPct(pct(get('gross'))) },
      { label: 'Operating margin', value: formatPct(pct(op)) },
      { label: 'Free cash flow', value: formatMoney(get('fcf')) },
      { label: 'FCF margin', value: formatPct(pct(get('fcf'))) },
      { label: 'Cash conversion', value: op && ocf != null ? formatPct((ocf / op) * 100) : '—' },
      { label: 'Cash on hand', value: formatMoney(nodeAmount(nodes.find((n) => n.id === 'capital')), false) },
    ];
  }, [nodes]);

  const filteredEvidence = useMemo(() => {
    const list = evidenceFilter === 'all'
      ? evidence
      : evidence.filter((ev) => ev.node === (evidenceFilter === 'off' ? '' : evidenceFilter));
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [evidence, evidenceFilter]);

  const st = selectedNode ? nodeStyle(selectedNode.id) : DEFAULT_STYLE;
  const nodeEvidence = selectedNode ? evidence.filter((ev) => ev.node === selectedNode.id) : [];
  const unit = company?.unit || '';

  const fieldProps = { size: 'sm' as const, bg: 'var(--input-bg)', borderColor: 'var(--border-color)' };

  return (
    <Box h="100%" display="flex" flexDirection="column" bg="var(--card-bg)">
      <Flex px={4} py={3} borderBottom="1px solid" borderColor="var(--border-color)" align="center" gap={3}>
        <Heading size="lg" color="var(--heading-color)" flex={1}>
          Money Cycle
        </Heading>
        {company && (
          <>
            <Badge variant="subtle" colorPalette="green">
              {coverage.answered}/{coverage.total} answered
            </Badge>
            <Badge variant="subtle" colorPalette="blue">{coverage.onCycle} findings</Badge>
            {coverage.offCycle > 0 && (
              <Badge variant="subtle" colorPalette="gray">{coverage.offCycle} off-cycle</Badge>
            )}
          </>
        )}
      </Flex>

      <Box px={4} py={2} borderBottom="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
        <Flex gap={3} align="center" wrap="wrap">
          {isStaticMode ? (
            <Text fontSize="sm" fontWeight="600" color="var(--heading-color)">
              {company?.name || 'No company'}
            </Text>
          ) : (
            <>
              {company && (
                <>
                  <Input
                    {...fieldProps}
                    placeholder="Company"
                    value={company.name}
                    onChange={(e) => patchCompany({ name: e.target.value })}
                    w="200px"
                  />
                  <Input
                    {...fieldProps}
                    placeholder="Ticker"
                    value={company.ticker}
                    onChange={(e) => patchCompany({ ticker: e.target.value.toUpperCase() })}
                    w="90px"
                  />
                  <Button size="sm" colorPalette="blue" onClick={save} disabled={!company.name.trim() && !company.ticker.trim() && !storeKey}>
                    <Save size={14} /> Save
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={newCompany}>
                <Plus size={14} /> New
              </Button>
              {storeKey && saved.includes(storeKey) && (
                <Button size="sm" variant="ghost" colorPalette="red" onClick={remove}>
                  <Trash2 size={14} />
                </Button>
              )}
              {saveStatus && (
                <Text fontSize="sm" color={saveStatus === 'Saved' ? 'green.500' : 'red.400'}>{saveStatus}</Text>
              )}
              {dirty && !saveStatus && (
                <Text fontSize="xs" color="orange.400">unsaved changes</Text>
              )}
            </>
          )}
          {saved.length > 0 && (
            <>
              <Box borderLeft="1px solid" borderColor="var(--border-color)" h="24px" mx={1} />
              <FolderOpen size={14} color="var(--muted-text)" />
              {saved.map((name) => (
                <Button
                  key={name}
                  size="xs"
                  variant={name === storeKey ? 'solid' : 'outline'}
                  colorPalette={name === storeKey ? 'blue' : undefined}
                  onClick={() => navigate(`${BASE}/${encodeURIComponent(name)}`)}
                >
                  {name}
                </Button>
              ))}
            </>
          )}
        </Flex>
      </Box>

      <Box flex={1} overflow="auto" p={4}>
        {!company ? (
          saved.length === 0 ? (
            <Flex direction="column" align="center" justify="center" minH="280px" gap={3}>
              <Text color="var(--muted-text)">No companies yet.</Text>
              {canEdit && (
                <Button size="sm" colorPalette="blue" onClick={newCompany}>
                  <Plus size={14} /> New company
                </Button>
              )}
            </Flex>
          ) : (
            <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={3} maxW="3xl" mx="auto" pt={6}>
              {saved.map((name) => (
                <Box
                  key={name}
                  as="button"
                  p={4}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="var(--border-color)"
                  bg="var(--card-bg)"
                  textAlign="left"
                  cursor="pointer"
                  _hover={{ bg: 'var(--hover-bg)' }}
                  onClick={() => navigate(`${BASE}/${encodeURIComponent(name)}`)}
                >
                  <HStack justify="space-between">
                    <Text fontWeight="semibold" color="var(--heading-color)">{name}</Text>
                    <ChevronRight size={16} color="var(--muted-text)" />
                  </HStack>
                </Box>
              ))}
            </Grid>
          )
        ) : (
          <VStack align="stretch" gap={4}>
            <Box>
              <HStack gap={2} mb={1} align="baseline">
                <Heading size="md" color="var(--heading-color)">{company.name || 'Untitled company'}</Heading>
                {company.ticker && <Badge variant="outline" fontFamily="mono">{company.ticker}</Badge>}
              </HStack>
              {editing && canEdit ? (
                <VStack align="stretch" gap={2}>
                  <Textarea
                    {...fieldProps}
                    placeholder="What the company does, in one paragraph"
                    value={company.description}
                    onChange={(e) => patchCompany({ description: e.target.value })}
                    rows={2}
                  />
                  <HStack gap={2}>
                    <Input {...fieldProps} placeholder="Unit (USD M)" value={company.unit} onChange={(e) => patchCompany({ unit: e.target.value })} w="160px" />
                    <Input {...fieldProps} placeholder="Period (FY2025)" value={company.period} onChange={(e) => patchCompany({ period: e.target.value })} w="160px" />
                  </HStack>
                </VStack>
              ) : (
                company.description && (
                  <Text fontSize="sm" color="var(--muted-text)" whiteSpace="pre-wrap">{company.description}</Text>
                )
              )}
            </Box>

            {/* Top: headline | cash walk */}
            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <Box flex={{ lg: '1 1 50%' }} w={{ base: '100%', lg: '50%' }} minW={0}>
                <Box h="100%" p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
                  <HStack justify="space-between" mb={3}>
                    <Heading size="sm" color="var(--heading-color)">Headline</Heading>
                    <Text fontSize="xs" color="var(--muted-text)">{[company.period, unit].filter(Boolean).join(' · ')}</Text>
                  </HStack>
                  <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
                    {headline.map((h) => (
                      <Box key={h.label}>
                        <Text fontSize="2xs" color="var(--muted-text)">{h.label}</Text>
                        <Text fontSize="lg" fontWeight="semibold" fontFamily="mono" color="var(--heading-color)">{h.value}</Text>
                      </Box>
                    ))}
                  </Grid>
                  <Box mt={4}>
                    <Text fontSize="2xs" color="var(--muted-text)" mb={2}>Research coverage</Text>
                    <VStack align="stretch" gap={1}>
                      {nodes.map((n) => {
                        const c = questionCoverage(n);
                        const ns = nodeStyle(n.id);
                        const evCount = evidence.filter((ev) => ev.node === n.id).length;
                        return (
                          <HStack
                            key={n.id}
                            gap={2}
                            cursor="pointer"
                            onClick={() => setSelected(n.id)}
                            _hover={{ bg: 'var(--hover-bg)' }}
                            borderRadius="sm"
                            px={1}
                          >
                            <Text fontSize="xs" w="70px" color={ns.color} fontWeight={n.id === selectedNode?.id ? '700' : '500'}>
                              {n.label}
                            </Text>
                            <Box flex="1" h="6px" borderRadius="full" bg="var(--border-color)" overflow="hidden">
                              <Box h="100%" w={`${c.total ? (c.answered / c.total) * 100 : 0}%`} bg={ns.color} />
                            </Box>
                            <Text fontSize="2xs" fontFamily="mono" color="var(--muted-text)" w="34px" textAlign="right">
                              {c.answered}/{c.total}
                            </Text>
                            <Text fontSize="2xs" fontFamily="mono" color="var(--muted-text)" w="24px" textAlign="right">
                              {evCount || ''}
                            </Text>
                          </HStack>
                        );
                      })}
                    </VStack>
                  </Box>
                </Box>
              </Box>
              <Box flex={{ lg: '1 1 50%' }} w={{ base: '100%', lg: '50%' }} minW={0}>
                <CashWalk nodes={nodes} unit={unit} period={company.period} onSelectNode={setSelected} />
              </Box>
            </Flex>

            {/* Bottom: node detail | graph */}
            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <VStack
                align="stretch"
                gap={4}
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                minW={0}
                order={{ base: 2, lg: 1 }}
              >
                {selectedNode && (
                  <Box p={5} borderRadius="xl" border="1px solid" borderColor={st.border} bg={st.bg}>
                    <HStack mb={4} justify="space-between" flexWrap="wrap" gap={2}>
                      <HStack>
                        <Heading size="md" color={st.color}>{selectedNode.label}</Heading>
                        <Badge variant="outline" fontFamily="mono" fontSize="2xs">{selectedNode.id}</Badge>
                      </HStack>
                      <HStack gap={2}>
                        {nodeAmount(selectedNode) != null && (
                          <Badge variant="solid" fontSize="sm" px={2} py={1} colorPalette={(nodeAmount(selectedNode) ?? 0) < 0 ? 'red' : 'green'}>
                            {formatMoney(nodeAmount(selectedNode), selectedNode.id !== 'capital' && selectedNode.id !== 'market')} {unit}
                          </Badge>
                        )}
                        {canEdit && (
                          <Button size="xs" variant="ghost" onClick={() => setEditing((v) => !v)}>
                            {editing ? 'Done editing' : 'Edit'}
                          </Button>
                        )}
                      </HStack>
                    </HStack>

                    {editing && canEdit ? (
                      <VStack align="stretch" gap={4}>
                        <Grid templateColumns={{ base: '1fr', md: '1fr 2fr' }} gap={3}>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Label</Text>
                            <Input {...fieldProps} value={selectedNode.label} onChange={(e) => updateNode({ label: e.target.value })} />
                          </Box>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Summary</Text>
                            <Input {...fieldProps} value={selectedNode.summary} onChange={(e) => updateNode({ summary: e.target.value })} />
                          </Box>
                        </Grid>
                        <Box>
                          <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Notes</Text>
                          <Textarea {...fieldProps} rows={4} value={selectedNode.details} onChange={(e) => updateNode({ details: e.target.value })} />
                        </Box>

                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">
                              Amount ({unit}) {selectedNode.id === 'capital' ? '· balance' : '· + in / − out'}
                            </Text>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                const lines = [...(selectedNode.amount_lines || []), { id: newId('line'), label: 'New line', amount: 0 }];
                                updateNode({ amount_lines: lines, amount: lines.reduce((s, l) => s + (l.amount || 0), 0) });
                              }}
                            >
                              + line
                            </Button>
                          </HStack>
                          <VStack align="stretch" gap={2}>
                            {(selectedNode.amount_lines || []).length === 0 && (
                              <Input
                                {...fieldProps}
                                type="number"
                                w="160px"
                                value={selectedNode.amount ?? ''}
                                onChange={(e) => updateNode({ amount: e.target.value === '' ? null : Number(e.target.value) })}
                              />
                            )}
                            {(selectedNode.amount_lines || []).map((line, i) => (
                              <HStack key={line.id || i} gap={2}>
                                <Input
                                  {...fieldProps}
                                  size="xs"
                                  flex="1"
                                  value={line.label}
                                  onChange={(e) => {
                                    const lines = (selectedNode.amount_lines || []).map((l, j) => (j === i ? { ...l, label: e.target.value } : l));
                                    updateNode({ amount_lines: lines });
                                  }}
                                />
                                <Input
                                  {...fieldProps}
                                  size="xs"
                                  type="number"
                                  w="100px"
                                  value={line.amount}
                                  onChange={(e) => {
                                    const amount = Number(e.target.value) || 0;
                                    const lines = (selectedNode.amount_lines || []).map((l, j) => (j === i ? { ...l, amount } : l));
                                    updateNode({ amount_lines: lines, amount: lines.reduce((s, l) => s + (l.amount || 0), 0) });
                                  }}
                                />
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorPalette="red"
                                  onClick={() => {
                                    const lines = (selectedNode.amount_lines || []).filter((_, j) => j !== i);
                                    updateNode({
                                      amount_lines: lines,
                                      amount: lines.length ? lines.reduce((s, l) => s + (l.amount || 0), 0) : selectedNode.amount,
                                    });
                                  }}
                                >
                                  ×
                                </Button>
                              </HStack>
                            ))}
                          </VStack>
                        </Box>

                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">Metrics</Text>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => updateNode({ metrics: [...selectedNode.metrics, { id: newId('m'), label: 'New metric', value: '' }] })}
                            >
                              + metric
                            </Button>
                          </HStack>
                          <VStack align="stretch" gap={2}>
                            {selectedNode.metrics.map((m, i) => (
                              <HStack key={m.id} gap={2}>
                                <Input
                                  {...fieldProps}
                                  size="xs"
                                  flex="1"
                                  value={m.label}
                                  onChange={(e) => updateNode({ metrics: selectedNode.metrics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                                />
                                <Input
                                  {...fieldProps}
                                  size="xs"
                                  w="110px"
                                  placeholder="value"
                                  value={m.value}
                                  onChange={(e) => updateNode({ metrics: selectedNode.metrics.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                                />
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorPalette="red"
                                  onClick={() => updateNode({ metrics: selectedNode.metrics.filter((_, j) => j !== i) })}
                                >
                                  ×
                                </Button>
                              </HStack>
                            ))}
                          </VStack>
                        </Box>

                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">Questions</Text>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => updateNode({ questions: [...selectedNode.questions, { id: newId('q'), text: '', answer: '' }] })}
                            >
                              + question
                            </Button>
                          </HStack>
                          <VStack align="stretch" gap={3}>
                            {selectedNode.questions.map((q, i) => (
                              <Box key={q.id}>
                                <HStack gap={2} mb={1}>
                                  <Input
                                    {...fieldProps}
                                    size="xs"
                                    flex="1"
                                    fontWeight="600"
                                    value={q.text}
                                    onChange={(e) => updateNode({ questions: selectedNode.questions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                                  />
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    colorPalette="red"
                                    onClick={() => updateNode({ questions: selectedNode.questions.filter((_, j) => j !== i) })}
                                  >
                                    ×
                                  </Button>
                                </HStack>
                                <Textarea
                                  {...fieldProps}
                                  size="xs"
                                  rows={2}
                                  placeholder="Answer"
                                  value={q.answer}
                                  onChange={(e) => updateNode({ questions: selectedNode.questions.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })}
                                />
                              </Box>
                            ))}
                          </VStack>
                        </Box>

                        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3}>
                          {([
                            ['sources', 'Where to look', selectedNode.sources],
                            ['risks', 'Risks', selectedNode.risks],
                          ] as const).map(([key, label, value]) => (
                            <Box key={key}>
                              <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>{label}</Text>
                              <Input {...fieldProps} value={tagsToString(value)} onChange={(e) => updateNode({ [key]: stringToTags(e.target.value) })} />
                            </Box>
                          ))}
                        </Grid>

                        {edges.filter((e) => e.from === selectedNode.id).length > 0 && (
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Outgoing flows ({unit})</Text>
                            <VStack align="stretch" gap={2}>
                              {edges.filter((e) => e.from === selectedNode.id).map((e) => (
                                <HStack key={e.id} gap={2}>
                                  <Text fontSize="sm" minW="110px" color="var(--heading-color)">
                                    → {nodes.find((n) => n.id === e.to)?.label || e.to}
                                  </Text>
                                  <Input
                                    {...fieldProps}
                                    size="xs"
                                    w="90px"
                                    placeholder="label"
                                    value={e.label || ''}
                                    onChange={(ev) => updateEdge(e.id, { label: ev.target.value })}
                                  />
                                  <Input
                                    {...fieldProps}
                                    size="xs"
                                    type="number"
                                    w="90px"
                                    placeholder="flow"
                                    value={e.flow ?? ''}
                                    onChange={(ev) => updateEdge(e.id, { flow: ev.target.value === '' ? null : Number(ev.target.value) })}
                                  />
                                </HStack>
                              ))}
                            </VStack>
                          </Box>
                        )}
                      </VStack>
                    ) : (
                      <VStack align="stretch" gap={4}>
                        <Text fontSize="md" fontWeight="medium" color="var(--heading-color)">
                          {selectedNode.summary}
                        </Text>

                        {(selectedNode.amount_lines || []).length > 0 && (
                          <Box p={3} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                            <VStack align="stretch" gap={1.5}>
                              {selectedNode.amount_lines!.map((line, i) => (
                                <HStack key={line.id || i} justify="space-between" gap={3} align="flex-start">
                                  <Box flex="1" minW={0}>
                                    <Text fontSize="sm" color="var(--heading-color)">{line.label}</Text>
                                    {line.note && <Text fontSize="2xs" color="var(--muted-text)">{line.note}</Text>}
                                  </Box>
                                  <Text fontSize="sm" fontFamily="mono" fontWeight="600" color="var(--muted-text)" whiteSpace="nowrap">
                                    {formatMoney(line.amount)}
                                  </Text>
                                </HStack>
                              ))}
                            </VStack>
                          </Box>
                        )}

                        {selectedNode.metrics.length > 0 && (
                          <Grid templateColumns="repeat(auto-fill, minmax(130px, 1fr))" gap={2}>
                            {selectedNode.metrics.map((m) => (
                              <Box key={m.id} p={2} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                                <Text fontSize="2xs" color="var(--muted-text)">{m.label}</Text>
                                <Text
                                  fontSize="sm"
                                  fontWeight="600"
                                  fontFamily="mono"
                                  color={m.value ? 'var(--heading-color)' : 'var(--empty-text)'}
                                >
                                  {m.value || '—'}
                                </Text>
                              </Box>
                            ))}
                          </Grid>
                        )}

                        {selectedNode.details && (
                          <Text fontSize="sm" color="var(--heading-color)" whiteSpace="pre-wrap" lineHeight="1.6">
                            {selectedNode.details}
                          </Text>
                        )}

                        {selectedNode.questions.length > 0 && (
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                              Questions · {questionCoverage(selectedNode).answered}/{selectedNode.questions.length}
                            </Text>
                            <VStack align="stretch" gap={2}>
                              {selectedNode.questions.map((q) => {
                                const done = !!q.answer.trim();
                                return (
                                  <HStack key={q.id} align="flex-start" gap={2}>
                                    <Box pt="2px" color={done ? st.color : 'var(--empty-text)'} flexShrink={0}>
                                      {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                    </Box>
                                    <Box>
                                      <Text fontSize="sm" color={done ? 'var(--heading-color)' : 'var(--muted-text)'}>{q.text}</Text>
                                      {done && (
                                        <Text fontSize="xs" color="var(--heading-color)" whiteSpace="pre-wrap" mt={0.5} pl={2} borderLeft="2px solid" borderColor={st.border}>
                                          {q.answer}
                                        </Text>
                                      )}
                                    </Box>
                                  </HStack>
                                );
                              })}
                            </VStack>
                          </Box>
                        )}

                        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3}>
                          {([
                            ['Where to look', selectedNode.sources],
                            ['Risks', selectedNode.risks],
                          ] as const).map(([label, tags]) => (
                            <Box key={label} p={3} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                              <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>{label}</Text>
                              {tags.length === 0 ? (
                                <Text fontSize="sm" color="var(--empty-text)">—</Text>
                              ) : (
                                <Flex gap={1} flexWrap="wrap">
                                  {tags.map((t) => <Badge key={t} variant="subtle" size="sm">{t}</Badge>)}
                                </Flex>
                              )}
                            </Box>
                          ))}
                        </Grid>

                        <Box>
                          <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                            Findings · {nodeEvidence.length}
                          </Text>
                          <VStack align="stretch" gap={2}>
                            {nodeEvidence.map((ev) => (
                              <EvidenceRow
                                key={ev.id}
                                ev={ev}
                                nodes={nodes}
                                showNode={false}
                                editable={false}
                                onChange={(p) => updateEvidence(ev.id, p)}
                                onRemove={() => removeEvidence(ev.id)}
                                onSelectNode={setSelected}
                              />
                            ))}
                            {canEdit && (
                              <EvidenceForm nodes={nodes} defaultNode={selectedNode.id} onAdd={addEvidence} />
                            )}
                          </VStack>
                        </Box>

                        {edges.filter((e) => e.from === selectedNode.id).length > 0 && (
                          <Flex gap={2} flexWrap="wrap">
                            {edges.filter((e) => e.from === selectedNode.id).map((e) => {
                              const dest = nodes.find((n) => n.id === e.to);
                              const bits = [dest?.label || e.to, e.label || null, e.flow != null ? formatMoney(e.flow, false) : null].filter(Boolean);
                              return (
                                <Button key={e.id} size="xs" variant="outline" onClick={() => setSelected(e.to)}>
                                  → {bits.join(' · ')}
                                </Button>
                              );
                            })}
                          </Flex>
                        )}
                      </VStack>
                    )}
                  </Box>
                )}
              </VStack>

              <Box
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                minW={0}
                order={{ base: 1, lg: 2 }}
              >
                <Box position={{ lg: 'sticky' }} top={0}>
                  <MoneyGraph
                    nodes={nodes}
                    edges={edges}
                    evidence={evidence}
                    selected={selectedNode?.id || ''}
                    onSelect={setSelected}
                  />
                </Box>
              </Box>
            </Flex>

            {/* Evidence log */}
            <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
              <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
                <Heading size="sm" color="var(--heading-color)">Findings</Heading>
                <Flex gap={1} flexWrap="wrap">
                  {[
                    { id: 'all', label: `All ${evidence.length}` },
                    ...nodes
                      .map((n) => ({ id: n.id, label: n.label, count: evidence.filter((ev) => ev.node === n.id).length }))
                      .filter((n) => n.count > 0)
                      .map((n) => ({ id: n.id, label: `${n.label} ${n.count}` })),
                    ...(coverage.offCycle > 0 ? [{ id: 'off', label: `Off-cycle ${coverage.offCycle}` }] : []),
                  ].map((f) => (
                    <Button
                      key={f.id}
                      size="xs"
                      variant={evidenceFilter === f.id ? 'solid' : 'outline'}
                      colorPalette={evidenceFilter === f.id ? 'blue' : undefined}
                      onClick={() => setEvidenceFilter(f.id)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </Flex>
              </HStack>
              <VStack align="stretch" gap={2}>
                {canEdit && <EvidenceForm nodes={nodes} defaultNode="" onAdd={addEvidence} />}
                {filteredEvidence.map((ev) => (
                  <EvidenceRow
                    key={ev.id}
                    ev={ev}
                    nodes={nodes}
                    showNode
                    editable={editing && canEdit}
                    onChange={(p) => updateEvidence(ev.id, p)}
                    onRemove={() => removeEvidence(ev.id)}
                    onSelectNode={setSelected}
                  />
                ))}
                {filteredEvidence.length === 0 && (
                  <Text fontSize="sm" color="var(--empty-text)">No findings.</Text>
                )}
              </VStack>
            </Box>
          </VStack>
        )}
      </Box>
    </Box>
  );
};

export default MoneyCycle;
