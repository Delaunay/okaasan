import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Button, Flex, Grid, Heading, HStack, Input, Text, Textarea, VStack, Badge, Table,
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsonStore, isStaticMode } from '../../services/jsonstore';
import {
  Save, FolderOpen, Plus, Trash2, ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

/** One line in a node's CO₂e breakdown (graph shows the rolled-up total). */
export interface Co2eLine {
  id?: string;
  label: string;
  co2e_kg: number;
  note?: string;
}

export interface CycleNode {
  id: string;
  label: string;
  summary: string;
  details: string;
  inputs: string[];
  outputs: string[];
  impacts: string[];
  /** kg CO₂e per functional unit (rolled-up total shown on the graph). Negative = credit. */
  co2e_kg: number | null;
  co2e_note: string;
  /** Optional breakdown of co2e_kg into line items (shown when the node is selected). */
  co2e_lines?: Co2eLine[];
  /** Optional grid layout (legacy). */
  col?: number;
  row?: number;
  /** Optional pixel position (preferred for free layouts). */
  x?: number;
  y?: number;
  /** Optional custom node height (rarely used). */
  h?: number;
  /** Optional custom node width (Fill spans the three circles). */
  w?: number;
}

export interface CycleEdge {
  id: string;
  from: string;
  to: string;
  /** Short label on the arrow, e.g. "Deliver", "cullet". */
  label?: string;
  /** Visual path group / cycle color. */
  path?: 'primary' | 'spine' | 'manufacture' | 'deliver' | 'throw' | 'recycle' | 'reuse' | 'entry' | 'exit';
  /**
   * Relative material flow on this arrow alone (not shared with other edges).
   * Used to size stroke width; set per edge when you have mass / volume data.
   */
  flow?: number | null;
  /** Optional kg CO₂e for logistics / transport edges. */
  co2e_kg?: number | null;
  co2e_note?: string;
}

export interface ResourceCycleProduct {
  name: string;
  description: string;
  functional_unit: string;
  co2e_basis: string;
  nodes: CycleNode[];
  edges: CycleEdge[];
  /**
   * Sketch layout arc radii (SVG px):
   * - `manufacture_r` / `recycle_r` / `reuse_r` — circular arc radius per cycle
   * - `left_r_scale` / `right_r_scale` — optional side multipliers (default 1)
   */
  layout?: {
    type?: 'sketch' | string;
    manufacture_r?: number;
    recycle_r?: number;
    reuse_r?: number;
    left_r_scale?: number;
    right_r_scale?: number;
  };
}

const COLLECTION = 'resource-cycle';

const PATH_COLORS: Record<string, string> = {
  primary: 'var(--icon-color)',
  spine: 'var(--icon-color)',
  manufacture: 'var(--panel-orange-text)',
  deliver: 'var(--panel-blue-text)',
  entry: 'var(--panel-green-text)',
  exit: 'var(--panel-red-text)',
  throw: 'var(--panel-red-text)',
  recycle: 'var(--panel-purple-text)',
  reuse: 'var(--panel-teal-text)',
};

const NODE_COLORS = [
  'var(--panel-green-text)',
  'var(--panel-orange-text)',
  'var(--panel-blue-text)',
  'var(--panel-teal-text)',
  'var(--panel-purple-text)',
  'var(--panel-red-text)',
];

const NODE_W = 112;
const NODE_H = 64;

function emptyNode(id: string, label: string): CycleNode {
  return {
    id,
    label,
    summary: '',
    details: '',
    inputs: [],
    outputs: [],
    impacts: [],
    co2e_kg: null,
    co2e_note: '',
    co2e_lines: [],
  };
}

/** Rolled-up node total: prefer explicit co2e_kg, else sum of lines. */
function nodeCo2eTotal(n: CycleNode): number | null {
  if (typeof n.co2e_kg === 'number' && !Number.isNaN(n.co2e_kg)) return n.co2e_kg;
  const lines = n.co2e_lines || [];
  if (lines.length === 0) return null;
  return lines.reduce((s, l) => s + (l.co2e_kg || 0), 0);
}

function formatCo2e(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(kg)) return '—';
  const sign = kg > 0 ? '+' : '';
  const abs = Math.abs(kg);
  const digits = abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return `${sign}${kg.toFixed(digits)} kg`;
}

/** Default hand-sketch graph. */
function defaultGraph(): {
  nodes: CycleNode[];
  edges: CycleEdge[];
  layout: NonNullable<ResourceCycleProduct['layout']>;
} {
  const layout: NonNullable<ResourceCycleProduct['layout']> = {
    type: 'sketch',
    manufacture_r: 230,
    recycle_r: 170,
    reuse_r: 115,
    left_r_scale: 1.15,
    right_r_scale: 0.9,
  };
  const geom = sketchGeometry(layout);
  const nodes: CycleNode[] = [
    { ...emptyNode('harvest', 'Raw Material'), ...geom.pos.harvest },
    { ...emptyNode('manufacture', 'Manufacture'), ...geom.pos.manufacture },
    { ...emptyNode('recycle', 'Recycle'), ...geom.pos.recycle },
    { ...emptyNode('reuse', 'Reuse'), ...geom.pos.reuse },
    { ...emptyNode('fill', 'Transformation'), ...geom.pos.fill },
    { ...emptyNode('use', 'Use'), ...geom.pos.use },
    { ...emptyNode('throw', 'Landfill'), ...geom.pos.throw },
  ];
  const edges: CycleEdge[] = [
    { id: 'e-harvest-man', from: 'harvest', to: 'manufacture', path: 'entry', flow: 1 },
    { id: 'e-man-fill', from: 'manufacture', to: 'fill', path: 'manufacture', flow: 1 },
    { id: 'e-rec-fill', from: 'recycle', to: 'fill', path: 'recycle', flow: 1 },
    { id: 'e-reu-fill', from: 'reuse', to: 'fill', path: 'reuse', flow: 1 },
    { id: 'e-fill-use', from: 'fill', to: 'use', path: 'primary', flow: 1 },
    { id: 'e-use-landfill', from: 'use', to: 'throw', path: 'exit', flow: 0.25 },
    // Left return arcs (no Use → Manufacture)
    { id: 'e-use-rec', from: 'use', to: 'recycle', path: 'recycle', flow: 0.7 },
    { id: 'e-use-reu', from: 'use', to: 'reuse', path: 'reuse', flow: 0.55 },
  ];
  return { nodes, edges, layout };
}

function normalizeProduct(data: Partial<ResourceCycleProduct> & { stages?: any[] }, fallbackName: string): ResourceCycleProduct {
  // New graph format
  if (Array.isArray(data.nodes) && data.nodes.length > 0) {
    return {
      name: data.name || fallbackName,
      description: data.description || '',
      functional_unit: data.functional_unit || '',
      co2e_basis: data.co2e_basis || '',
      layout: { ...(data.layout || {}), type: 'sketch' },
      nodes: data.nodes.map((n) => ({
        id: n.id,
        label: n.label || n.id,
        summary: n.summary || '',
        details: n.details || '',
        inputs: n.inputs || [],
        outputs: n.outputs || [],
        impacts: n.impacts || [],
        co2e_kg: typeof n.co2e_kg === 'number' ? n.co2e_kg : null,
        co2e_note: n.co2e_note || '',
        co2e_lines: Array.isArray(n.co2e_lines)
          ? n.co2e_lines.map((l: Co2eLine, i: number) => ({
            id: l.id || `line-${i}`,
            label: l.label || `Line ${i + 1}`,
            co2e_kg: typeof l.co2e_kg === 'number' ? l.co2e_kg : 0,
            note: l.note || '',
          }))
          : [],
        col: n.col,
        row: n.row,
        x: n.x,
        y: n.y,
        h: n.h,
        w: n.w,
      })),
      edges: (data.edges || []).map((e, i) => ({
        id: e.id || `e${i}`,
        from: e.from,
        to: e.to,
        label: e.label,
        path: e.path || 'primary',
        flow: typeof e.flow === 'number' ? e.flow : null,
        co2e_kg: typeof e.co2e_kg === 'number' ? e.co2e_kg : null,
        co2e_note: e.co2e_note || '',
      })),
    };
  }

  // Legacy linear stages → simple chain graph
  const stages = data.stages || [];
  if (stages.length > 0) {
    const nodes: CycleNode[] = stages.map((s: any, i: number) => ({
      id: s.id,
      label: (s.id || `step${i}`).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      summary: s.summary || '',
      details: s.details || '',
      inputs: s.inputs || [],
      outputs: s.outputs || [],
      impacts: s.impacts || [],
      co2e_kg: typeof s.co2e_kg === 'number' ? s.co2e_kg : null,
      co2e_note: s.co2e_note || '',
      col: i,
      row: 1,
    }));
    const edges: CycleEdge[] = nodes.slice(0, -1).map((n, i) => ({
      id: `legacy-${i}`,
      from: n.id,
      to: nodes[i + 1].id,
      path: 'primary' as const,
    }));
    return {
      name: data.name || fallbackName,
      description: data.description || '',
      functional_unit: data.functional_unit || '',
      co2e_basis: data.co2e_basis || '',
      nodes,
      edges,
    };
  }

  const g = defaultGraph();
  return {
    name: data.name || fallbackName,
    description: data.description || '',
    functional_unit: data.functional_unit || '',
    co2e_basis: data.co2e_basis || '',
    ...g,
  };
}

function tagsToString(tags: string[]): string {
  return tags.join(', ');
}

function stringToTags(value: string): string[] {
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Stroke width for one arrow from its own flow (independent of every other edge). */
function edgeStrokeWidth(flow: number | null | undefined): number {
  const f = flow == null || Number.isNaN(flow) ? 1 : Math.max(0.12, flow);
  return 1.6 + f * 2.8;
}

function nodeColor(id: string, index: number): string {
  const map: Record<string, string> = {
    harvest: 'var(--panel-green-text)',
    manufacture: 'var(--panel-orange-text)',
    deliver: 'var(--panel-blue-text)',
    distribute: 'var(--panel-blue-text)',
    fill: 'var(--panel-teal-text)',
    use: 'var(--heading-color)',
    throw: 'var(--panel-red-text)',
    recycle: 'var(--panel-purple-text)',
    wash: 'var(--panel-teal-text)',
    reuse: 'var(--panel-teal-text)',
  };
  return map[id] || NODE_COLORS[index % NODE_COLORS.length];
}

function nodePanel(id: string): { bg: string; border: string } {
  const map: Record<string, { bg: string; border: string }> = {
    harvest: { bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)' },
    manufacture: { bg: 'var(--panel-orange-bg)', border: 'var(--panel-orange-border)' },
    deliver: { bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
    distribute: { bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
    fill: { bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
    use: { bg: 'var(--card-bg)', border: 'var(--border-color)' },
    throw: { bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)' },
    recycle: { bg: 'var(--panel-purple-bg)', border: 'var(--panel-purple-border)' },
    wash: { bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
    reuse: { bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
  };
  return map[id] || { bg: 'var(--card-bg)', border: 'var(--border-color)' };
}

// ── Graph layout + SVG ─────────────────────────────────────

type NodePos = { x: number; y: number; h?: number; w?: number };

/**
 * Hand-sketch layout — node positions traced from the user's SVG (1024×737).
 * Arc paths use layout.manufacture_r / recycle_r / reuse_r as circular radii.
 */
function sketchGeometry(layout?: ResourceCycleProduct['layout']): {
  radii: { manufacture: number; recycle: number; reuse: number };
  pos: Record<string, NodePos>;
  left_r_scale: number;
  right_r_scale: number;
} {
  const S = 0.72;
  const nw = Math.round(247 * S);
  const nh = Math.round(81 * S);
  const at = (x: number, y: number): NodePos => ({
    x: Math.round(x * S),
    y: Math.round(y * S),
    w: nw,
    h: nh,
  });

  const manufacture = at(503, 5);
  const recycle = at(503, 151);
  const reuse = at(503, 297);
  const fill = at(820, 485);
  const use = at(503, 651);

  const radii = {
    manufacture: layout?.manufacture_r ?? 230,
    recycle: layout?.recycle_r ?? 170,
    reuse: layout?.reuse_r ?? 115,
  };

  return {
    radii,
    left_r_scale: layout?.left_r_scale ?? 1.15,
    right_r_scale: layout?.right_r_scale ?? 0.9,
    pos: {
      harvest: at(2, 5),
      manufacture,
      recycle,
      reuse,
      fill,
      use,
      throw: at(2, 651),
    },
  };
}

/**
 * Circular SVG arc p0→p1 with a given radius.
 * `side` picks which of the two possible arcs (bulge left vs right on screen).
 */
function arcWithRadius(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  radius: number,
  side: 'left' | 'right',
): string {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-3) return `M ${p0.x} ${p0.y}`;
  const r = Math.max(radius, chord / 2 + 0.5);
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const h = Math.sqrt(Math.max(r * r - (chord * 0.5) ** 2, 0));
  const sagitta = r - h;
  const nx = -dy / chord;
  const ny = dx / chord;
  const b1 = { x: mx + nx * sagitta, y: my + ny * sagitta };
  const b2 = { x: mx - nx * sagitta, y: my - ny * sagitta };
  const mid = side === 'left'
    ? (b1.x <= b2.x ? b1 : b2)
    : (b1.x >= b2.x ? b1 : b2);
  return arcThrough3(p0, mid, p1);
}

function sketchArcPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  side: 'left' | 'right',
  key: 'manufacture' | 'recycle' | 'reuse',
  geom: {
    radii: { manufacture: number; recycle: number; reuse: number };
    left_r_scale: number;
    right_r_scale: number;
  },
): string {
  const scale = side === 'left' ? geom.left_r_scale : geom.right_r_scale;
  return arcWithRadius(p0, p1, geom.radii[key] * scale, side);
}

function layoutNodes(
  nodes: CycleNode[],
  layout?: ResourceCycleProduct['layout'],
): Map<string, NodePos> {
  const geom = sketchGeometry(layout);
  const positions = new Map<string, NodePos>();
  for (const n of nodes) {
    const g = geom.pos[n.id];
    if (g) positions.set(n.id, { ...g });
    else positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, h: n.h, w: n.w });
  }
  return positions;
}

function nodeSize(pos: NodePos): { w: number; h: number } {
  return { w: pos.w ?? NODE_W, h: pos.h ?? NODE_H };
}

function sidePoint(
  node: NodePos,
  side: 'left' | 'right' | 'top' | 'bottom',
): { x: number; y: number } {
  const { w, h } = nodeSize(node);
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  if (side === 'left') return { x: node.x, y: cy };
  if (side === 'right') return { x: node.x + w, y: cy };
  if (side === 'top') return { x: cx, y: node.y };
  return { x: cx, y: node.y + h };
}

/** Point along the top edge: t=0 left, t=1 right. */
function topEdgePoint(node: NodePos, t: number): { x: number; y: number } {
  const { w } = nodeSize(node);
  return { x: node.x + w * t, y: node.y };
}

/** Point along the left edge: t=0 top, t=1 bottom. */
function leftEdgePoint(node: NodePos, t: number): { x: number; y: number } {
  const { h } = nodeSize(node);
  return { x: node.x, y: node.y + h * t };
}

/** SVG circular arc through three points (hand-sketch nested curves). */
function arcThrough3(
  p0: { x: number; y: number },
  mid: { x: number; y: number },
  p1: { x: number; y: number },
): string {
  const ax = p0.x;
  const ay = p0.y;
  const bx = mid.x;
  const by = mid.y;
  const cx = p1.x;
  const cy = p1.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) {
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }
  const ux =
    ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux);
  const am = Math.atan2(by - uy, bx - ux);
  const a1 = Math.atan2(cy - uy, cx - ux);

  // Choose sweep so mid lies on the arc from p0 → p1
  const dCw = ((a1 - a0) + Math.PI * 2) % (Math.PI * 2);
  const midCw = (am - a0 + Math.PI * 2) % (Math.PI * 2);
  const preferCw = midCw <= dCw + 1e-6;
  const delta = preferCw ? dCw : -(((a0 - a1) + Math.PI * 2) % (Math.PI * 2));
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = preferCw ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`;
}

function edgeEndpoints(
  from: NodePos,
  to: NodePos,
): { x1: number; y1: number; x2: number; y2: number } {
  const s1 = nodeSize(from);
  const s2 = nodeSize(to);
  const cx1 = from.x + s1.w / 2;
  const cy1 = from.y + s1.h / 2;
  const cx2 = to.x + s2.w / 2;
  const cy2 = to.y + s2.h / 2;
  const dx = cx2 - cx1;
  const dy = cy2 - cy1;
  const len = Math.hypot(dx, dy) || 1;
  const inset = 36;
  return {
    x1: cx1 + (dx / len) * inset,
    y1: cy1 + (dy / len) * inset,
    x2: cx2 - (dx / len) * inset,
    y2: cy2 - (dy / len) * inset,
  };
}

// ── Per-cycle statement (spreadsheet) ──────────────────────

type CycleColumn = 'manufacture' | 'recycle' | 'reuse' | 'exit';

const CYCLE_COLUMNS: { id: CycleColumn; label: string; color: string }[] = [
  { id: 'manufacture', label: 'Manufacture', color: PATH_COLORS.manufacture },
  { id: 'recycle', label: 'Recycle', color: PATH_COLORS.recycle },
  { id: 'reuse', label: 'Reuse', color: PATH_COLORS.reuse },
  { id: 'exit', label: 'Landfill', color: PATH_COLORS.exit },
];

/**
 * Pathway line items for each circle.
 * Each column is a complete route for 1 functional unit taking that end-of-life path.
 */
function buildCycleStatement(
  nodes: CycleNode[],
  edges: CycleEdge[],
): { rows: { key: string; label: string; values: Partial<Record<CycleColumn, number | null>> }[]; totals: Record<CycleColumn, number> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const val = (id: string) => nodeCo2eTotal(byId.get(id) || emptyNode(id, id));
  const edgeVal = (pred: (e: CycleEdge) => boolean) => {
    const hit = edges.find(pred);
    return hit && typeof hit.co2e_kg === 'number' ? hit.co2e_kg : null;
  };

  const fill = val('fill');
  const use = val('use');
  const manToFill = edgeVal((e) => e.from === 'manufacture' && e.to === 'fill');
  const fillToUse = edgeVal((e) => e.from === 'fill' && e.to === 'use');
  const recToFill = edgeVal((e) => e.from === 'recycle' && e.to === 'fill');
  const reuToFill = edgeVal((e) => e.from === 'reuse' && e.to === 'fill');

  const rows: { key: string; label: string; values: Partial<Record<CycleColumn, number | null>> }[] = [
    {
      key: 'harvest',
      label: 'Raw Material',
      values: { manufacture: val('harvest') },
    },
    {
      key: 'manufacture',
      label: 'Manufacture',
      values: { manufacture: val('manufacture') },
    },
    {
      key: 'e-man-fill',
      label: 'Deliver (empty → transform)',
      values: { manufacture: manToFill },
    },
    {
      key: 'recycle',
      label: 'Recycle (collect → remelt)',
      values: { recycle: val('recycle') },
    },
    {
      key: 'e-rec-fill',
      label: 'Deliver (cullet ware → transform)',
      values: { recycle: recToFill },
    },
    {
      key: 'reuse',
      label: 'Reuse (return → wash)',
      values: { reuse: val('reuse') },
    },
    {
      key: 'e-reu-fill',
      label: 'Deliver (washed → transform)',
      values: { reuse: reuToFill },
    },
    {
      key: 'fill',
      label: 'Transformation',
      values: { manufacture: fill, recycle: fill, reuse: fill },
    },
    {
      key: 'e-fill-use',
      label: 'Deliver (finished → use)',
      values: { manufacture: fillToUse, recycle: fillToUse, reuse: fillToUse },
    },
    {
      key: 'use',
      label: 'Use',
      values: { manufacture: use, recycle: use, reuse: use, exit: use },
    },
    {
      key: 'throw',
      label: 'Landfill',
      values: { exit: val('throw') },
    },
  ];

  const totals: Record<CycleColumn, number> = {
    manufacture: 0,
    recycle: 0,
    reuse: 0,
    exit: 0,
  };
  for (const row of rows) {
    for (const col of CYCLE_COLUMNS) {
      const v = row.values[col.id];
      if (typeof v === 'number') totals[col.id] += v;
    }
  }

  return { rows, totals };
}

const CycleStatement: React.FC<{
  nodes: CycleNode[];
  edges: CycleEdge[];
  functionalUnit: string;
  onSelectNode: (id: string) => void;
}> = ({ nodes, edges, functionalUnit, onSelectNode }) => {
  const { rows, totals } = useMemo(() => buildCycleStatement(nodes, edges), [nodes, edges]);
  const hasAny = rows.some((r) => CYCLE_COLUMNS.some((c) => r.values[c.id] != null));
  if (!hasAny) return null;

  return (
    <Box
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      bg="var(--card-bg)"
      overflowX="auto"
      h="100%"
    >
      <Box px={4} pt={3} pb={2}>
        <Heading size="sm" color="var(--heading-color)">
          Per-cycle statement
        </Heading>
        <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
          Pathway accounting {functionalUnit ? `per ${functionalUnit}` : ''} — each column is one end-of-life route (shared steps like Transformation appear in every route that uses them).
        </Text>
      </Box>
      <Table.Root size="sm" variant="outline" stickyHeader>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader minW="160px">Step</Table.ColumnHeader>
            {CYCLE_COLUMNS.map((c) => (
              <Table.ColumnHeader key={c.id} textAlign="right" color={c.color}>
                {c.label}
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const isNode = ['harvest', 'manufacture', 'recycle', 'reuse', 'fill', 'use', 'throw'].includes(row.key);
            const empty = CYCLE_COLUMNS.every((c) => row.values[c.id] == null);
            if (empty) return null;
            return (
              <Table.Row
                key={row.key}
                cursor={isNode ? 'pointer' : 'default'}
                _hover={isNode ? { bg: 'var(--surface-muted)' } : undefined}
                onClick={() => { if (isNode) onSelectNode(row.key); }}
              >
                <Table.Cell fontSize="sm" fontWeight={isNode ? '600' : '400'} color="var(--heading-color)">
                  {row.label}
                </Table.Cell>
                {CYCLE_COLUMNS.map((c) => {
                  const v = row.values[c.id];
                  return (
                    <Table.Cell
                      key={c.id}
                      textAlign="right"
                      fontFamily="mono"
                      fontSize="xs"
                      color="var(--muted-text)"
                      fontWeight={v != null ? '600' : '400'}
                    >
                      {v == null ? '—' : formatCo2e(v)}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            );
          })}
          <Table.Row bg="var(--surface-muted)">
            <Table.Cell fontSize="sm" fontWeight="700" color="var(--heading-color)">
              Pathway total
            </Table.Cell>
            {CYCLE_COLUMNS.map((c) => (
              <Table.Cell
                key={c.id}
                textAlign="right"
                fontFamily="mono"
                fontSize="sm"
                fontWeight="700"
                color={c.color}
              >
                {formatCo2e(totals[c.id])}
              </Table.Cell>
            ))}
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

const FlowGraph: React.FC<{
  nodes: CycleNode[];
  edges: CycleEdge[];
  selected: string;
  onSelect: (id: string) => void;
  layout?: ResourceCycleProduct['layout'];
}> = ({ nodes, edges, selected, onSelect, layout }) => {
  const geom = useMemo(() => sketchGeometry(layout), [layout]);
  const positions = useMemo(() => layoutNodes(nodes, layout), [nodes, layout]);

  const width = useMemo(() => {
    let maxX = 0;
    for (const p of positions.values()) {
      maxX = Math.max(maxX, p.x + nodeSize(p).w);
    }
    return Math.max(maxX + 80, 720);
  }, [positions]);

  const height = useMemo(() => {
    let maxY = 0;
    for (const p of positions.values()) {
      maxY = Math.max(maxY, p.y + nodeSize(p).h);
    }
    return Math.max(maxY + 60, 560);
  }, [positions]);

  const edgePath = (e: CycleEdge) => {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) return '';
    const kind = e.path || 'primary';

    // Raw Material → Manufacture / Use → Landfill
    if (kind === 'entry' || kind === 'exit' || kind === 'throw') {
      const fromRight = kind === 'entry';
      const p1 = fromRight ? sidePoint(a, 'right') : sidePoint(a, 'left');
      const p2 = fromRight ? sidePoint(b, 'left') : sidePoint(b, 'right');
      const y = (p1.y + p2.y) / 2;
      return `M ${p1.x} ${y} L ${p2.x} ${y}`;
    }

    const fill = positions.get('fill');
    const use = positions.get('use');

    // Manufacture / Recycle / Reuse → Fill (right nested arcs → Fill top)
    if (fill && e.to === 'fill' && (e.from === 'manufacture' || e.from === 'recycle' || e.from === 'reuse')) {
      const key = e.from as 'manufacture' | 'recycle' | 'reuse';
      const topT = key === 'reuse' ? 0.14 : key === 'recycle' ? 0.41 : 0.70;
      const p0 = sidePoint(a, 'right');
      const p1 = topEdgePoint(fill, topT);
      return sketchArcPath(p0, p1, 'right', key, geom);
    }

    // Fill → Use — single arc
    if (fill && use && e.from === 'fill' && e.to === 'use') {
      const p0 = sidePoint(fill, 'bottom');
      const p1 = sidePoint(use, 'right');
      const r = geom.radii.recycle * geom.right_r_scale;
      return arcWithRadius(p0, p1, r, 'right');
    }

    // Use → Manufacture / Recycle / Reuse (left nested return arcs)
    if (use && e.from === 'use' && (e.to === 'manufacture' || e.to === 'recycle' || e.to === 'reuse')) {
      const key = e.to as 'manufacture' | 'recycle' | 'reuse';
      const useT = key === 'manufacture' ? 0.70 : key === 'recycle' ? 0.48 : 0.28;
      const p0 = leftEdgePoint(use, useT);
      const p1 = leftEdgePoint(b, 0.55);
      return sketchArcPath(p0, p1, 'left', key, geom);
    }

    // Fallback
    if (kind === 'spine' || kind === 'deliver') {
      const p1 = sidePoint(a, 'bottom');
      const p2 = sidePoint(b, 'top');
      const bulge = 72;
      return `M ${p1.x} ${p1.y} C ${p1.x + bulge} ${p1.y}, ${p2.x + bulge} ${p2.y}, ${p2.x} ${p2.y}`;
    }

    const { x1, y1, x2, y2 } = edgeEndpoints(a, b);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
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
      <svg width={width} height={height} style={{ display: 'block', minWidth: width }}>
        <defs>
          {edges.map((e) => {
            const kind = e.path || 'primary';
            const sw = edgeStrokeWidth(e.flow);
            const markerSize = Math.min(11, 4.5 + sw * 0.85);
            return (
              <marker
                key={`m-${e.id}`}
                id={`arrow-edge-${e.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth={markerSize}
                markerHeight={markerSize}
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={PATH_COLORS[kind] || PATH_COLORS.primary} />
              </marker>
            );
          })}
        </defs>

        {/* Stroke width = edge.flow (material amount); each arrow is independent */}

        {edges.map((e) => {
          const kind = e.path || 'primary';
          const d = edgePath(e);
          if (!d) return null;
          const sw = edgeStrokeWidth(e.flow);
          const pathId = `rc-edge-${e.id}`;
          const edgeLabel = e.label
            ? (e.co2e_kg != null ? `${e.label} ${formatCo2e(e.co2e_kg)}` : e.label)
            : (e.co2e_kg != null ? formatCo2e(e.co2e_kg) : '');
          return (
            <g key={e.id}>
              <path
                id={pathId}
                d={d}
                fill="none"
                stroke={PATH_COLORS[kind] || PATH_COLORS.primary}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={`url(#arrow-edge-${e.id})`}
                opacity={0.92}
              >
                <title>
                  {[
                    `${e.from} → ${e.to}`,
                    e.flow != null ? `flow ${e.flow}` : null,
                    e.co2e_note || null,
                  ].filter(Boolean).join(' · ')}
                </title>
              </path>
              {edgeLabel && (
                <text
                  fontSize="10"
                  fill={PATH_COLORS[kind] || 'var(--muted-text)'}
                  fontWeight="600"
                  dy={-7}
                  style={{ pointerEvents: 'none' }}
                >
                  <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                    {edgeLabel}
                  </textPath>
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n, i) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const { w, h } = nodeSize(p);
          const isSel = selected === n.id;
          const color = nodeColor(n.id, i);
          const panel = nodePanel(n.id);
          const tall = h > NODE_H + 10;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(n.id)}
            >
              <rect
                width={w}
                height={h}
                rx={8}
                fill={isSel ? panel.bg : 'var(--card-bg)'}
                stroke={isSel ? color : panel.border}
                strokeWidth={isSel ? 2.25 : 1.25}
              />
              <text
                x={w / 2}
                y={tall ? h / 2 - 6 : 22}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill={color}
              >
                {n.label}
              </text>
              <text
                x={w / 2}
                y={tall ? h / 2 + 12 : 42}
                textAnchor="middle"
                fontSize="10"
                fill={(() => {
                  const t = nodeCo2eTotal(n);
                  return t != null && t < 0 ? 'var(--panel-green-text)' : 'var(--muted-text)';
                })()}
                fontWeight="600"
              >
                {formatCo2e(nodeCo2eTotal(n))}
              </text>
              {n.summary && <title>{n.summary}</title>}
            </g>
          );
        })}
      </svg>

      <HStack gap={4} px={3} pb={2} flexWrap="wrap" align="center">
        {(
          [
            ['manufacture', 'Manufacture'],
            ['recycle', 'Recycle'],
            ['reuse', 'Reuse'],
            ['primary', 'Transformation → Use'],
            ['entry', 'Raw Material → Manufacture'],
            ['exit', 'Use → Landfill'],
          ] as const
        ).map(([kind, label]) => (
          <HStack key={kind} gap={1.5}>
            <Box
              w="18px"
              h="0"
              borderTop="2.5px solid"
              borderColor={PATH_COLORS[kind]}
            />
            <Text fontSize="2xs" color="var(--muted-text)">{label}</Text>
          </HStack>
        ))}
        <Text fontSize="2xs" color="var(--empty-text)" ml="auto">
          arrow width = edge flow
        </Text>
      </HStack>
    </Box>
  );
};

// ── Main page ──────────────────────────────────────────────

const ResourceCycle: React.FC = () => {
  const { product: urlProduct } = useParams<{ product?: string }>();
  const navigate = useNavigate();

  const [storeKey, setStoreKey] = useState('');
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [functionalUnit, setFunctionalUnit] = useState('');
  const [co2eBasis, setCo2eBasis] = useState('');
  const [nodes, setNodes] = useState<CycleNode[]>([]);
  const [edges, setEdges] = useState<CycleEdge[]>([]);
  const [layout, setLayout] = useState<ResourceCycleProduct['layout']>();
  const [selected, setSelected] = useState('');
  const [savedProducts, setSavedProducts] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selected) || nodes[0],
    [nodes, selected],
  );

  const co2Totals = useMemo(() => {
    const nodeVals = nodes.map(nodeCo2eTotal).filter((v): v is number => typeof v === 'number');
    const edgeVals = edges.map((e) => e.co2e_kg).filter((v): v is number => typeof v === 'number');
    const values = [...nodeVals, ...edgeVals];
    const total = values.reduce((a, b) => a + b, 0);
    return { total, hasData: values.length > 0 };
  }, [nodes, edges]);

  const applyProduct = useCallback((normalized: ResourceCycleProduct, key: string) => {
    setStoreKey(key);
    setProductName(normalized.name);
    setDescription(normalized.description);
    setFunctionalUnit(normalized.functional_unit);
    setCo2eBasis(normalized.co2e_basis);
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    setLayout(normalized.layout);
    setSelected(normalized.nodes[0]?.id || '');
    setDirty(false);
    setEditing(false);
  }, []);

  const doLoad = useCallback(async (name: string) => {
    try {
      const data = await jsonStore.get<ResourceCycleProduct>(COLLECTION, name);
      applyProduct(normalizeProduct(data, name), name);
    } catch {
      setSaveStatus('Load failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [applyProduct]);

  useEffect(() => {
    jsonStore.list(COLLECTION).then(setSavedProducts).catch(() => { });
    if (urlProduct) {
      doLoad(urlProduct);
    } else {
      setStoreKey('');
      setProductName('');
      setDescription('');
      setFunctionalUnit('');
      setCo2eBasis('');
      setNodes([]);
      setEdges([]);
      setLayout(undefined);
      setSelected('');
      setDirty(false);
      setEditing(false);
    }
  }, [urlProduct, doLoad]);

  const saveProduct = async () => {
    const name = (storeKey || productName).trim();
    if (!name) return;
    const key = name.replace(/[^a-zA-Z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '') || name;
    try {
      const data: ResourceCycleProduct = {
        name: productName.trim() || key,
        description,
        functional_unit: functionalUnit,
        co2e_basis: co2eBasis,
        nodes,
        edges,
        layout,
      };
      await jsonStore.put(COLLECTION, key, data);
      setStoreKey(key);
      setProductName(data.name);
      setDirty(false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
      if (!savedProducts.includes(key)) setSavedProducts((prev) => [...prev, key].sort());
      navigate(`/scratch/resource-cycle/${encodeURIComponent(key)}`, { replace: true });
    } catch {
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const loadProduct = (name: string) => {
    navigate(`/scratch/resource-cycle/${encodeURIComponent(name)}`);
  };

  const newProduct = () => {
    navigate('/scratch/resource-cycle');
    const g = defaultGraph();
    setStoreKey('');
    setProductName('');
    setDescription('');
    setFunctionalUnit('1 kg product');
    setCo2eBasis('');
    setNodes(g.nodes);
    setEdges(g.edges);
    setLayout(g.layout);
    setSelected(g.nodes[0].id);
    setDirty(false);
    setEditing(true);
  };

  const deleteProduct = async () => {
    const key = storeKey.trim();
    if (!key || isStaticMode) return;
    if (!confirm(`Delete product “${productName || key}”?`)) return;
    try {
      await jsonStore.remove(COLLECTION, key);
      setSavedProducts((prev) => prev.filter((p) => p !== key));
      navigate('/scratch/resource-cycle');
    } catch {
      setSaveStatus('Delete failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const updateNode = (patch: Partial<CycleNode>) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? { ...n, ...patch } : n)));
    setDirty(true);
  };

  const updateEdge = (id: string, patch: Partial<CycleEdge>) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setDirty(true);
  };

  const patchLayout = (patch: Partial<NonNullable<ResourceCycleProduct['layout']>>) => {
    setLayout((prev) => ({
      manufacture_r: 230,
      recycle_r: 170,
      reuse_r: 115,
      left_r_scale: 1.15,
      right_r_scale: 0.9,
      ...prev,
      ...patch,
      type: 'sketch',
    }));
    setDirty(true);
  };

  const panel = selectedNode ? nodePanel(selectedNode.id) : { bg: 'var(--card-bg)', border: 'var(--border-color)' };
  const color = selectedNode ? nodeColor(selectedNode.id, 0) : 'var(--icon-color)';
  const filledCount = nodes.filter((n) => n.summary.trim()).length;

  return (
    <Box h="100%" display="flex" flexDirection="column" bg="var(--card-bg)">
      <Flex px={4} py={3} borderBottom="1px solid" borderColor="var(--border-color)" align="center" gap={3}>
        <Heading size="lg" color="var(--heading-color)" flex={1}>
          Resource Cycle
        </Heading>
        {productName && (
          <Badge variant="subtle" colorPalette="green">
            {filledCount}/{nodes.length} nodes
          </Badge>
        )}
      </Flex>

      <Box px={4} py={2} borderBottom="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
        <Flex gap={3} align="center" wrap="wrap">
          {isStaticMode ? (
            <Text fontSize="sm" fontWeight="600" color="var(--heading-color)">
              {productName || 'No product'}
            </Text>
          ) : (
            <>
              <Input
                size="sm"
                placeholder="Product name"
                value={productName}
                onChange={(e) => { setProductName(e.target.value); setDirty(true); }}
                w="220px"
                bg="var(--input-bg)"
                borderColor="var(--border-color)"
              />
              <Button size="sm" colorPalette="blue" onClick={saveProduct} disabled={!productName.trim() && !storeKey}>
                <Save size={14} /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={newProduct}>
                <Plus size={14} /> New
              </Button>
              {storeKey && savedProducts.includes(storeKey) && (
                <Button size="sm" variant="ghost" colorPalette="red" onClick={deleteProduct}>
                  <Trash2 size={14} />
                </Button>
              )}
              {saveStatus && (
                <Text fontSize="sm" color={saveStatus === 'Saved' ? 'green.500' : 'red.400'}>{saveStatus}</Text>
              )}
              {dirty && !saveStatus && (productName.trim() || storeKey) && (
                <Text fontSize="xs" color="orange.400">unsaved changes</Text>
              )}
            </>
          )}
          {savedProducts.length > 0 && (
            <>
              <Box borderLeft="1px solid" borderColor="var(--border-color)" h="24px" mx={1} />
              <FolderOpen size={14} color="var(--muted-text)" />
              {savedProducts.map((name) => (
                <Button
                  key={name}
                  size="xs"
                  variant={name === storeKey ? 'solid' : 'outline'}
                  colorPalette={name === storeKey ? 'blue' : undefined}
                  onClick={() => loadProduct(name)}
                >
                  {name}
                </Button>
              ))}
            </>
          )}
        </Flex>
      </Box>

      <Box flex={1} overflow="auto" p={4}>
        {!urlProduct && !productName && savedProducts.length === 0 ? (
          <Flex direction="column" align="center" justify="center" minH="280px" gap={3}>
            <Text color="var(--muted-text)">
              No products yet. Create one to map raw material → manufacture → transformation → use, with recycle / reuse / landfill loops.
            </Text>
            {!isStaticMode && (
              <Button size="sm" colorPalette="blue" onClick={newProduct}>
                <Plus size={14} /> Create first product
              </Button>
            )}
          </Flex>
        ) : !urlProduct && !productName && savedProducts.length > 0 ? (
          <VStack align="stretch" gap={4} maxW="3xl" mx="auto" pt={6}>
            <Text color="var(--muted-text)" textAlign="center">
              Choose a product to inspect its resource flow graph.
            </Text>
            <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={3}>
              {savedProducts.map((name) => (
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
                  onClick={() => loadProduct(name)}
                >
                  <HStack justify="space-between">
                    <Text fontWeight="semibold" color="var(--heading-color)">{name}</Text>
                    <ChevronRight size={16} color="var(--muted-text)" />
                  </HStack>
                </Box>
              ))}
            </Grid>
          </VStack>
        ) : (
          <VStack align="stretch" gap={4} maxW="100%" mx="auto">
            <Box>
              <Heading size="md" color="var(--heading-color)" mb={1}>
                {productName || 'Untitled product'}
              </Heading>
              {editing && !isStaticMode ? (
                <VStack align="stretch" gap={2}>
                  <Textarea
                    size="sm"
                    placeholder="Description…"
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                    rows={2}
                  />
                  <Input
                    size="sm"
                    placeholder="Functional unit"
                    value={functionalUnit}
                    onChange={(e) => { setFunctionalUnit(e.target.value); setDirty(true); }}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                  <Textarea
                    size="sm"
                    placeholder="CO₂e basis / sources…"
                    value={co2eBasis}
                    onChange={(e) => { setCo2eBasis(e.target.value); setDirty(true); }}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                    rows={2}
                  />
                </VStack>
              ) : (
                <VStack align="stretch" gap={1}>
                  {description && (
                    <Text fontSize="sm" color="var(--muted-text)" whiteSpace="pre-wrap">{description}</Text>
                  )}
                  {functionalUnit && (
                    <Text fontSize="xs" color="var(--muted-text)">
                      <Text as="span" fontWeight="semibold">Per: </Text>{functionalUnit}
                    </Text>
                  )}
                </VStack>
              )}
            </Box>


            {/* Top: CO₂ summary | per-cycle statement */}
            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <Box
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                minW={0}
              >
                {co2Totals.hasData ? (
                  <Box
                    h="100%"
                    p={4}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor="var(--border-color)"
                    bg="var(--card-bg)"
                  >
                    <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                      CO₂e summary {functionalUnit ? `(${functionalUnit})` : ''}
                    </Text>
                    <Box>
                      <Text fontSize="2xs" color="var(--muted-text)">Total emissions (sum of nodes & edges)</Text>
                      <Text fontSize="lg" fontWeight="semibold">{formatCo2e(co2Totals.total)}</Text>
                    </Box>
                    <Text fontSize="2xs" color="var(--empty-text)" mt={2}>
                      Absolute process emissions only — no avoided-burden credits. Compare pathways in the statement (do not add columns together).
                    </Text>
                    {co2eBasis && !editing && (
                      <Text fontSize="2xs" color="var(--empty-text)" mt={2}>{co2eBasis}</Text>
                    )}
                  </Box>
                ) : (
                  <Box
                    h="100%"
                    p={4}
                    borderRadius="lg"
                    border="1px dashed"
                    borderColor="var(--border-color)"
                  >
                    <Text fontSize="sm" color="var(--empty-text)">No CO₂e figures yet</Text>
                  </Box>
                )}
              </Box>
              <Box
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                minW={0}
              >
                <CycleStatement
                  nodes={nodes}
                  edges={edges}
                  functionalUnit={functionalUnit}
                  onSelectNode={setSelected}
                />
              </Box>
            </Flex>

            {/* Bottom: node detail | plot */}
            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <VStack
                align="stretch"
                gap={4}
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                order={{ base: 2, lg: 1 }}
              >
                {selectedNode && (
                  <Box p={5} borderRadius="xl" border="1px solid" borderColor={panel.border} bg={panel.bg}>
                    <HStack mb={4} justify="space-between" flexWrap="wrap" gap={2}>
                      <HStack>
                        <Heading size="md" color={color}>{selectedNode.label}</Heading>
                        <Badge variant="outline" fontFamily="mono" fontSize="2xs">{selectedNode.id}</Badge>
                      </HStack>
                      <HStack gap={2}>
                        {selectedNode.co2e_kg != null && (
                          <Badge
                            variant="solid"
                            colorPalette="orange"
                            fontSize="sm"
                            px={2}
                            py={1}
                          >
                            {formatCo2e(selectedNode.co2e_kg)} CO₂e
                          </Badge>
                        )}
                        {!isStaticMode && (
                          <Button size="xs" variant="ghost" onClick={() => setEditing((v) => !v)}>
                            {editing ? 'Done editing' : 'Edit node'}
                          </Button>
                        )}
                      </HStack>
                    </HStack>

                    {editing && !isStaticMode ? (
                      <VStack align="stretch" gap={4}>
                        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3}>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Label</Text>
                            <Input size="sm" value={selectedNode.label} onChange={(e) => updateNode({ label: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
                          </Box>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Summary</Text>
                            <Input size="sm" value={selectedNode.summary} onChange={(e) => updateNode({ summary: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
                          </Box>
                        </Grid>
                        <Box>
                          <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>Details</Text>
                          <Textarea size="sm" rows={5} value={selectedNode.details} onChange={(e) => updateNode({ details: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
                        </Box>
                        <Grid templateColumns={{ base: '1fr', md: '140px 1fr' }} gap={3}>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>CO₂e total (kg)</Text>
                            <Input
                              size="sm"
                              type="number"
                              step="0.01"
                              value={selectedNode.co2e_kg ?? ''}
                              onChange={(e) => updateNode({ co2e_kg: e.target.value === '' ? null : Number(e.target.value) })}
                              bg="var(--input-bg)"
                              borderColor="var(--border-color)"
                            />
                          </Box>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>CO₂e note</Text>
                            <Input size="sm" value={selectedNode.co2e_note} onChange={(e) => updateNode({ co2e_note: e.target.value })} bg="var(--input-bg)" borderColor="var(--border-color)" />
                          </Box>
                        </Grid>
                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">CO₂e breakdown lines</Text>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                const lines = [...(selectedNode.co2e_lines || []), { id: `line-${Date.now()}`, label: 'New line', co2e_kg: 0 }];
                                const sum = lines.reduce((s, l) => s + (l.co2e_kg || 0), 0);
                                updateNode({ co2e_lines: lines, co2e_kg: sum });
                              }}
                            >
                              + line
                            </Button>
                          </HStack>
                          <VStack align="stretch" gap={2}>
                            {(selectedNode.co2e_lines || []).map((line, i) => (
                              <HStack key={line.id || i} gap={2} align="center">
                                <Input
                                  size="xs"
                                  flex="1"
                                  value={line.label}
                                  onChange={(e) => {
                                    const lines = (selectedNode.co2e_lines || []).map((l, j) => (j === i ? { ...l, label: e.target.value } : l));
                                    updateNode({ co2e_lines: lines });
                                  }}
                                  bg="var(--input-bg)"
                                  borderColor="var(--border-color)"
                                />
                                <Input
                                  size="xs"
                                  type="number"
                                  step="0.01"
                                  w="88px"
                                  value={line.co2e_kg}
                                  onChange={(e) => {
                                    const kg = Number(e.target.value) || 0;
                                    const lines = (selectedNode.co2e_lines || []).map((l, j) => (j === i ? { ...l, co2e_kg: kg } : l));
                                    const sum = lines.reduce((s, l) => s + (l.co2e_kg || 0), 0);
                                    updateNode({ co2e_lines: lines, co2e_kg: sum });
                                  }}
                                  bg="var(--input-bg)"
                                  borderColor="var(--border-color)"
                                />
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorPalette="red"
                                  onClick={() => {
                                    const lines = (selectedNode.co2e_lines || []).filter((_, j) => j !== i);
                                    const sum = lines.reduce((s, l) => s + (l.co2e_kg || 0), 0);
                                    updateNode({ co2e_lines: lines, co2e_kg: lines.length ? sum : selectedNode.co2e_kg });
                                  }}
                                >
                                  ×
                                </Button>
                              </HStack>
                            ))}
                            {(selectedNode.co2e_lines || []).length === 0 && (
                              <Text fontSize="2xs" color="var(--empty-text)">No lines — add items to break down the step total.</Text>
                            )}
                          </VStack>
                        </Box>
                        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={3}>
                          {([
                            ['inputs', 'Inputs', selectedNode.inputs],
                            ['outputs', 'Outputs', selectedNode.outputs],
                            ['impacts', 'Impacts', selectedNode.impacts],
                          ] as const).map(([key, label, value]) => (
                            <Box key={key}>
                              <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>{label}</Text>
                              <Input
                                size="sm"
                                value={tagsToString(value)}
                                onChange={(e) => updateNode({ [key]: stringToTags(e.target.value) })}
                                bg="var(--input-bg)"
                                borderColor="var(--border-color)"
                              />
                            </Box>
                          ))}
                        </Grid>
                      </VStack>
                    ) : (
                      <VStack align="stretch" gap={4}>
                        <Text fontSize="md" fontWeight="medium" color="var(--heading-color)">
                          {selectedNode.summary || (
                            <Text as="span" color="var(--empty-text)" fontStyle="italic">No summary yet.</Text>
                          )}
                        </Text>
                        <Box p={3} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                          <HStack justify="space-between" mb={2}>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">
                              CO₂e breakdown
                            </Text>
                            <Text fontSize="xs" fontWeight="700" color={color}>
                              Total {formatCo2e(nodeCo2eTotal(selectedNode))}
                            </Text>
                          </HStack>
                          {(selectedNode.co2e_lines || []).length > 0 ? (
                            <VStack align="stretch" gap={1.5}>
                              {selectedNode.co2e_lines!.map((line, i) => (
                                <HStack key={line.id || i} justify="space-between" gap={3} align="flex-start">
                                  <Box flex="1" minW={0}>
                                    <Text fontSize="sm" color="var(--heading-color)">{line.label}</Text>
                                    {line.note && (
                                      <Text fontSize="2xs" color="var(--muted-text)">{line.note}</Text>
                                    )}
                                  </Box>
                                  <Text
                                    fontSize="sm"
                                    fontFamily="mono"
                                    fontWeight="600"
                                    color="var(--muted-text)"
                                    whiteSpace="nowrap"
                                  >
                                    {formatCo2e(line.co2e_kg)}
                                  </Text>
                                </HStack>
                              ))}
                            </VStack>
                          ) : (
                            <Text fontSize="sm" color="var(--empty-text)">
                              No line items — graph total is {formatCo2e(nodeCo2eTotal(selectedNode))}.
                            </Text>
                          )}
                          {selectedNode.co2e_note && (
                            <Text fontSize="2xs" color="var(--muted-text)" mt={2} whiteSpace="pre-wrap">
                              {selectedNode.co2e_note}
                            </Text>
                          )}
                        </Box>
                        {selectedNode.details && (
                          <Text fontSize="sm" color="var(--heading-color)" whiteSpace="pre-wrap" lineHeight="1.6">
                            {selectedNode.details}
                          </Text>
                        )}
                        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={3}>
                          {([
                            ['Inputs', selectedNode.inputs],
                            ['Outputs', selectedNode.outputs],
                            ['Impacts', selectedNode.impacts],
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
                        {edges.filter((e) => e.from === selectedNode.id).length > 0 && (
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                              Outgoing arrows {editing ? '(flow = stroke width)' : ''}
                            </Text>
                            <VStack align="stretch" gap={2}>
                              {edges.filter((e) => e.from === selectedNode.id).map((e) => {
                                const dest = nodes.find((n) => n.id === e.to);
                                if (editing && !isStaticMode) {
                                  return (
                                    <HStack key={e.id} gap={2} flexWrap="wrap" align="center">
                                      <Text fontSize="sm" minW="120px" color="var(--heading-color)">
                                        → {dest?.label || e.to}
                                      </Text>
                                      <Text fontSize="2xs" color="var(--muted-text)">flow</Text>
                                      <Input
                                        size="xs"
                                        type="number"
                                        step="0.05"
                                        min={0}
                                        w="72px"
                                        value={e.flow ?? ''}
                                        onChange={(ev) => {
                                          const raw = ev.target.value;
                                          updateEdge(e.id, {
                                            flow: raw === '' ? null : Number(raw),
                                          });
                                        }}
                                        bg="var(--input-bg)"
                                        borderColor="var(--border-color)"
                                      />
                                      <Box
                                        w={`${Math.max(8, edgeStrokeWidth(e.flow) * 4)}px`}
                                        h="0"
                                        borderTop={`${Math.max(1.5, edgeStrokeWidth(e.flow))}px solid`}
                                        borderColor={PATH_COLORS[e.path || 'primary']}
                                      />
                                      <Button size="xs" variant="ghost" onClick={() => setSelected(e.to)}>
                                        Go
                                      </Button>
                                    </HStack>
                                  );
                                }
                                const bits = [
                                  dest?.label || e.to,
                                  e.label || null,
                                  e.flow != null ? `flow ${e.flow}` : null,
                                  e.co2e_kg != null ? formatCo2e(e.co2e_kg) : null,
                                ].filter(Boolean);
                                return (
                                  <Button
                                    key={e.id}
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setSelected(e.to)}
                                    alignSelf="flex-start"
                                  >
                                    → {bits.join(' · ')}
                                  </Button>
                                );
                              })}
                            </VStack>
                          </Box>
                        )}
                      </VStack>
                    )}
                  </Box>
                )}
                {!selectedNode && (
                  <Box p={5} borderRadius="xl" border="1px dashed" borderColor="var(--border-color)">
                    <Text fontSize="sm" color="var(--empty-text)">Select a node on the graph</Text>
                  </Box>
                )}
              </VStack>

              <VStack
                align="stretch"
                gap={3}
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                minW={0}
                order={{ base: 1, lg: 2 }}
              >
                <FlowGraph
                  nodes={nodes}
                  edges={edges}
                  selected={selected}
                  onSelect={setSelected}
                  layout={layout}
                />
                {editing && !isStaticMode && (
                  <HStack gap={4} flexWrap="wrap" align="center">
                    {(
                      [
                        ['manufacture_r', 'R manufacture', layout?.manufacture_r ?? 230, 80, 400],
                        ['recycle_r', 'R recycle', layout?.recycle_r ?? 170, 60, 350],
                        ['reuse_r', 'R reuse', layout?.reuse_r ?? 115, 40, 300],
                        ['left_r_scale', 'Left ×', layout?.left_r_scale ?? 1.15, 0.5, 2],
                        ['right_r_scale', 'Right ×', layout?.right_r_scale ?? 0.9, 0.5, 2],
                      ] as const
                    ).map(([key, label, value, min, max]) => (
                      <HStack key={key} gap={2} align="center">
                        <Text fontSize="2xs" color="var(--muted-text)" minW="84px">{label}</Text>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={key.endsWith('_scale') ? 0.05 : 5}
                          value={value}
                          onChange={(e) => patchLayout({ [key]: Number(e.target.value) })}
                          style={{ width: 100 }}
                        />
                        <Text fontSize="2xs" color="var(--heading-color)" minW="36px">
                          {key.endsWith('_scale') ? value.toFixed(2) : Math.round(value)}
                        </Text>
                      </HStack>
                    ))}
                  </HStack>
                )}
              </VStack>
            </Flex>
          </VStack>
        )}
      </Box>
    </Box>
  );
};

export default ResourceCycle;
