import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Badge, Button, Flex, Grid, Heading, HStack, Input, Text, Textarea, VStack,
} from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';

// Physical side of a company: what it is built from, who supplies it, where it
// is made, and how it reaches customers. Columns run upstream → downstream so
// a node's position alone says which tier it is.

// ── Types ──────────────────────────────────────────────────

export type ChainKind = 'material' | 'tier2' | 'tier1' | 'site' | 'channel' | 'customer';

export interface ChainNode {
  id: string;
  kind: ChainKind;
  label: string;
  location: string;
  /** Free-form weight, e.g. "30% COGS", "45% revenue". */
  share: string;
  /** Single source, sanctioned region, bottleneck… */
  critical: boolean;
  note: string;
}

export interface ChainLink {
  id: string;
  from: string;
  to: string;
  /** What moves along the link, e.g. "cathodes", "finished units". */
  label: string;
  /** sea / road / rail / air / pipeline / digital… */
  mode: string;
  /** Relative volume; sizes the stroke. */
  volume: number | null;
}

export interface SupplyChainData {
  nodes: ChainNode[];
  links: ChainLink[];
}

export const COLUMNS: { kind: ChainKind; label: string; color: string; bg: string; border: string }[] = [
  { kind: 'material', label: 'Materials', color: 'var(--panel-green-text)', bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)' },
  { kind: 'tier2', label: 'Tier-2 suppliers', color: 'var(--panel-teal-text)', bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
  { kind: 'tier1', label: 'Tier-1 suppliers', color: 'var(--panel-purple-text)', bg: 'var(--panel-purple-bg)', border: 'var(--panel-purple-border)' },
  { kind: 'site', label: 'Sites', color: 'var(--panel-orange-text)', bg: 'var(--panel-orange-bg)', border: 'var(--panel-orange-border)' },
  { kind: 'channel', label: 'Channels', color: 'var(--panel-blue-text)', bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
  { kind: 'customer', label: 'Customers', color: 'var(--heading-color)', bg: 'var(--card-bg)', border: 'var(--border-color)' },
];

const COLUMN_INDEX: Record<ChainKind, number> = Object.fromEntries(COLUMNS.map((c, i) => [c.kind, i])) as Record<ChainKind, number>;

function column(kind: ChainKind) {
  return COLUMNS[COLUMN_INDEX[kind] ?? 0];
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function emptyChain(): SupplyChainData {
  return { nodes: [], links: [] };
}

export function normalizeChain(data: Partial<SupplyChainData> | undefined): SupplyChainData {
  const kinds = new Set(COLUMNS.map((c) => c.kind));
  const nodes = (data?.nodes || []).map((n) => ({
    id: n.id || newId('sc'),
    kind: kinds.has(n.kind) ? n.kind : 'material',
    label: n.label || '',
    location: n.location || '',
    share: n.share || '',
    critical: !!n.critical,
    note: n.note || '',
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = (data?.links || [])
    .filter((l) => ids.has(l.from) && ids.has(l.to))
    .map((l) => ({
      id: l.id || newId('sl'),
      from: l.from,
      to: l.to,
      label: l.label || '',
      mode: l.mode || '',
      volume: typeof l.volume === 'number' ? l.volume : null,
    }));
  return { nodes, links };
}

// ── Graph ──────────────────────────────────────────────────

const NODE_W = 150;
const NODE_H = 42;
const GAP_Y = 14;
const HEADER_H = 28;
const PAD_X = 8;
const MIN_W = 900;

const ChainGraph: React.FC<{
  chain: SupplyChainData;
  selected: string;
  editable: boolean;
  onSelect: (id: string) => void;
  onAdd: (kind: ChainKind) => void;
}> = ({ chain, selected, editable, onSelect, onAdd }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_W);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(MIN_W, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byColumn = useMemo(() => {
    const cols: ChainNode[][] = COLUMNS.map(() => []);
    for (const n of chain.nodes) cols[COLUMN_INDEX[n.kind]].push(n);
    return cols;
  }, [chain.nodes]);

  const colX = (i: number) => PAD_X + (i * (width - 2 * PAD_X - NODE_W)) / (COLUMNS.length - 1);
  const rows = Math.max(1, ...byColumn.map((c) => c.length));
  const height = HEADER_H + rows * (NODE_H + GAP_Y) + 8;

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    byColumn.forEach((col, i) => {
      // Center short columns against the tallest one.
      const offset = ((rows - col.length) * (NODE_H + GAP_Y)) / 2;
      col.forEach((n, j) => m.set(n.id, { x: colX(i), y: HEADER_H + offset + j * (NODE_H + GAP_Y) }));
    });
    return m;
    // colX depends on width only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byColumn, rows, width]);

  const maxVol = Math.max(0, ...chain.links.map((l) => Math.abs(l.volume ?? 0)));
  const stroke = (v: number | null) => (v == null || maxVol === 0 ? 1.8 : 1.5 + 7 * (Math.abs(v) / maxVol));

  const linkPath = (l: ChainLink) => {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) return null;
    const forward = b.x > a.x;
    const x0 = forward ? a.x + NODE_W : a.x;
    const x1 = forward ? b.x : b.x + NODE_W;
    const y0 = a.y + NODE_H / 2;
    const y1 = b.y + NODE_H / 2;
    const bend = Math.max(40, Math.abs(x1 - x0) / 2) * (forward ? 1 : -1);
    return {
      d: `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`,
      mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    };
  };

  return (
    <Box border="1px solid" borderColor="var(--border-color)" borderRadius="lg" bg="var(--surface-muted)" p={2} overflowX="auto">
      <Box ref={boxRef} w="100%" />
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          {COLUMNS.map((c) => (
            <marker
              key={c.kind}
              id={`sc-arrow-${c.kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c.color} />
            </marker>
          ))}
        </defs>

        {COLUMNS.map((c, i) => (
          <g key={c.kind}>
            <text x={colX(i) + NODE_W / 2} y={16} textAnchor="middle" fontSize="11" fontWeight="700" fill={c.color}>
              {c.label}
            </text>
            {editable && (
              <text
                x={colX(i) + NODE_W - 4}
                y={17}
                textAnchor="end"
                fontSize="15"
                fontWeight="700"
                fill={c.color}
                style={{ cursor: 'pointer' }}
                onClick={() => onAdd(c.kind)}
              >
                +
                <title>{`Add ${c.label.toLowerCase()}`}</title>
              </text>
            )}
          </g>
        ))}

        {chain.links.map((l) => {
          const p = linkPath(l);
          if (!p) return null;
          const from = chain.nodes.find((n) => n.id === l.from);
          const col = column(from?.kind || 'material');
          const touches = selected === l.from || selected === l.to;
          const text = [l.label, l.mode ? `(${l.mode})` : ''].filter(Boolean).join(' ');
          return (
            <g key={l.id} opacity={selected && !touches ? 0.3 : 0.85}>
              <path
                d={p.d}
                fill="none"
                stroke={col.color}
                strokeWidth={stroke(l.volume)}
                strokeLinecap="round"
                markerEnd={`url(#sc-arrow-${col.kind})`}
              >
                <title>{[text, l.volume != null ? `volume ${l.volume}` : ''].filter(Boolean).join(' · ')}</title>
              </path>
              {text && touches && (
                <text x={p.mid.x} y={p.mid.y - 5} textAnchor="middle" fontSize="9" fontWeight="600" fill={col.color} style={{ pointerEvents: 'none' }}>
                  {text}
                </text>
              )}
            </g>
          );
        })}

        {chain.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const c = column(n.kind);
          const isSel = selected === n.id;
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`} style={{ cursor: 'pointer' }} onClick={() => onSelect(n.id)}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={isSel ? c.bg : 'var(--card-bg)'}
                stroke={isSel ? c.color : n.critical ? 'var(--panel-red-text)' : c.border}
                strokeWidth={isSel ? 2 : n.critical ? 1.5 : 1}
                strokeDasharray={n.critical && !isSel ? '4 2' : undefined}
              />
              <text x={8} y={17} fontSize="11" fontWeight="700" fill={c.color}>
                {(n.label || 'Untitled').slice(0, 22)}
              </text>
              <text x={8} y={32} fontSize="9" fill="var(--muted-text)">
                {n.location.slice(0, 18)}
              </text>
              {n.share && (
                <text x={NODE_W - 6} y={32} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--heading-color)">
                  {n.share.slice(0, 12)}
                </text>
              )}
              {n.critical && <circle cx={NODE_W - 8} cy={10} r={3} fill="var(--panel-red-text)" />}
              {n.note && <title>{n.note}</title>}
            </g>
          );
        })}

        {chain.nodes.length === 0 && (
          <text x={width / 2} y={HEADER_H + 24} textAnchor="middle" fontSize="12" fill="var(--empty-text)">
            No supply chain mapped
          </text>
        )}
      </svg>
      <HStack gap={4} px={2} pt={1} flexWrap="wrap">
        <HStack gap={1.5}>
          <Box w="14px" h="10px" border="1.5px dashed" borderColor="var(--panel-red-text)" borderRadius="sm" />
          <Text fontSize="2xs" color="var(--muted-text)">critical</Text>
        </HStack>
        <Text fontSize="2xs" color="var(--empty-text)" ml="auto">arrow width = volume</Text>
      </HStack>
    </Box>
  );
};

// ── Panel ──────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  backgroundColor: 'var(--input-bg)',
  color: 'var(--heading-color)',
  fontSize: '13px',
};

const SupplyChain: React.FC<{
  chain: SupplyChainData;
  editing: boolean;
  canEdit: boolean;
  onToggleEdit: () => void;
  onChange: (chain: SupplyChainData) => void;
}> = ({ chain, editing, canEdit, onToggleEdit, onChange }) => {
  const [selected, setSelected] = useState('');
  const node = chain.nodes.find((n) => n.id === selected);
  const editable = editing && canEdit;
  const fieldProps = { size: 'sm' as const, bg: 'var(--input-bg)', borderColor: 'var(--border-color)' };

  const addNode = (kind: ChainKind) => {
    const n: ChainNode = { id: newId('sc'), kind, label: `New ${column(kind).label.toLowerCase().replace(/s$/, '')}`, location: '', share: '', critical: false, note: '' };
    onChange({ ...chain, nodes: [...chain.nodes, n] });
    setSelected(n.id);
  };

  const updateNode = (patch: Partial<ChainNode>) => {
    if (!node) return;
    onChange({ ...chain, nodes: chain.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) });
  };

  const removeNode = () => {
    if (!node) return;
    onChange({
      nodes: chain.nodes.filter((n) => n.id !== node.id),
      links: chain.links.filter((l) => l.from !== node.id && l.to !== node.id),
    });
    setSelected('');
  };

  const updateLink = (id: string, patch: Partial<ChainLink>) => {
    onChange({ ...chain, links: chain.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };

  const removeLink = (id: string) => {
    onChange({ ...chain, links: chain.links.filter((l) => l.id !== id) });
  };

  const addLink = () => {
    if (!node) return;
    // Default target: first node one column downstream.
    const next = chain.nodes.find((n) => COLUMN_INDEX[n.kind] === COLUMN_INDEX[node.kind] + 1)
      || chain.nodes.find((n) => n.id !== node.id);
    if (!next) return;
    onChange({ ...chain, links: [...chain.links, { id: newId('sl'), from: node.id, to: next.id, label: '', mode: '', volume: null }] });
  };

  const incoming = node ? chain.links.filter((l) => l.to === node.id) : [];
  const outgoing = node ? chain.links.filter((l) => l.from === node.id) : [];
  const nameOf = (id: string) => chain.nodes.find((n) => n.id === id)?.label || id;
  const c = node ? column(node.kind) : COLUMNS[0];
  const critical = chain.nodes.filter((n) => n.critical);

  return (
    <VStack align="stretch" gap={4}>
      <HStack justify="space-between">
        <HStack gap={2} flexWrap="wrap">
          {COLUMNS.map((col) => {
            const count = chain.nodes.filter((n) => n.kind === col.kind).length;
            return (
              <Badge key={col.kind} variant="outline" color={col.color}>
                {col.label} {count}
              </Badge>
            );
          })}
          {critical.length > 0 && <Badge variant="subtle" colorPalette="red">{critical.length} critical</Badge>}
        </HStack>
        {canEdit && (
          <Button size="xs" variant="ghost" onClick={onToggleEdit}>
            {editing ? 'Done editing' : 'Edit'}
          </Button>
        )}
      </HStack>

      <ChainGraph
        chain={chain}
        selected={selected}
        editable={editable}
        onSelect={(id) => setSelected((s) => (s === id ? '' : id))}
        onAdd={addNode}
      />

      {node && (
        <Box p={5} borderRadius="xl" border="1px solid" borderColor={c.border} bg={c.bg}>
          <HStack mb={3} justify="space-between" flexWrap="wrap" gap={2}>
            <HStack gap={2}>
              <Heading size="md" color={c.color}>{node.label || 'Untitled'}</Heading>
              <Badge variant="outline" fontSize="2xs">{c.label}</Badge>
              {node.critical && <Badge colorPalette="red" variant="solid" fontSize="2xs">critical</Badge>}
            </HStack>
            {editable && (
              <Button size="xs" variant="ghost" colorPalette="red" onClick={removeNode}>
                <Trash2 size={12} /> Remove
              </Button>
            )}
          </HStack>

          {editable ? (
            <VStack align="stretch" gap={3}>
              <Grid templateColumns={{ base: '1fr', md: '2fr 1fr 1fr 1fr' }} gap={2}>
                <Input {...fieldProps} placeholder="Name" value={node.label} onChange={(e) => updateNode({ label: e.target.value })} />
                <select value={node.kind} onChange={(e) => updateNode({ kind: e.target.value as ChainKind })} style={selectStyle}>
                  {COLUMNS.map((col) => <option key={col.kind} value={col.kind}>{col.label}</option>)}
                </select>
                <Input {...fieldProps} placeholder="Location" value={node.location} onChange={(e) => updateNode({ location: e.target.value })} />
                <Input {...fieldProps} placeholder="Share (30% COGS)" value={node.share} onChange={(e) => updateNode({ share: e.target.value })} />
              </Grid>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--heading-color)' }}>
                <input type="checkbox" checked={node.critical} onChange={(e) => updateNode({ critical: e.target.checked })} />
                Critical (single source, chokepoint, exposed region)
              </label>
              <Textarea {...fieldProps} rows={2} placeholder="Notes" value={node.note} onChange={(e) => updateNode({ note: e.target.value })} />

              <Box>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)">Ships to</Text>
                  <Button size="xs" variant="ghost" onClick={addLink} disabled={chain.nodes.length < 2}>
                    <Plus size={12} /> link
                  </Button>
                </HStack>
                <VStack align="stretch" gap={2}>
                  {outgoing.map((l) => (
                    <HStack key={l.id} gap={2} flexWrap="wrap">
                      <select value={l.to} onChange={(e) => updateLink(l.id, { to: e.target.value })} style={{ ...selectStyle, minWidth: 140 }}>
                        {chain.nodes.filter((n) => n.id !== node.id).map((n) => (
                          <option key={n.id} value={n.id}>{column(n.kind).label} · {n.label}</option>
                        ))}
                      </select>
                      <Input {...fieldProps} size="xs" w="140px" placeholder="what flows" value={l.label} onChange={(e) => updateLink(l.id, { label: e.target.value })} />
                      <Input {...fieldProps} size="xs" w="80px" placeholder="mode" value={l.mode} onChange={(e) => updateLink(l.id, { mode: e.target.value })} />
                      <Input
                        {...fieldProps}
                        size="xs"
                        w="80px"
                        type="number"
                        placeholder="volume"
                        value={l.volume ?? ''}
                        onChange={(e) => updateLink(l.id, { volume: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                      <Button size="xs" variant="ghost" colorPalette="red" onClick={() => removeLink(l.id)}>×</Button>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            </VStack>
          ) : (
            <VStack align="stretch" gap={3}>
              <HStack gap={4} flexWrap="wrap">
                {node.location && <Text fontSize="sm" color="var(--heading-color)">{node.location}</Text>}
                {node.share && <Text fontSize="sm" fontFamily="mono" color="var(--muted-text)">{node.share}</Text>}
              </HStack>
              {node.note && <Text fontSize="sm" color="var(--heading-color)" whiteSpace="pre-wrap">{node.note}</Text>}
              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3}>
                {([['Receives from', incoming, 'from'], ['Ships to', outgoing, 'to']] as const).map(([label, list, end]) => (
                  <Box key={label} p={3} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                    <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>{label}</Text>
                    {list.length === 0 ? (
                      <Text fontSize="sm" color="var(--empty-text)">—</Text>
                    ) : (
                      <Flex gap={1} flexWrap="wrap">
                        {list.map((l) => (
                          <Button key={l.id} size="xs" variant="outline" onClick={() => setSelected(l[end])}>
                            {[nameOf(l[end]), l.label, l.mode].filter(Boolean).join(' · ')}
                          </Button>
                        ))}
                      </Flex>
                    )}
                  </Box>
                ))}
              </Grid>
            </VStack>
          )}
        </Box>
      )}
    </VStack>
  );
};

export default SupplyChain;
