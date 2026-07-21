import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Text, Textarea, VStack, Badge,
} from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderOpen, ExternalLink, Zap } from 'lucide-react';
import { jsonStore, isStaticMode } from '../../services/jsonstore';

// ── Types ──────────────────────────────────────────────────

export type ClimateWave =
  | 'activities'
  | 'emissions'
  | 'atmosphere'
  | 'energy'
  | 'climate'
  | 'impacts'
  | 'responses';

export interface ClimateSource {
  label: string;
  url?: string;
  note?: string;
}

export interface ClimateCard {
  id: string;
  label: string;
  wave: ClimateWave;
  summary: string;
  details: string;
  key_figures?: string;
  sources: ClimateSource[];
  tags?: string[];
  /** Explicit spine grid (preferred over wave stacking). */
  col?: number;
  row?: number;
  x?: number;
  y?: number;
}

export interface ClimateLink {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface ClimateDeck {
  name: string;
  description: string;
  credit: string;
  disclaimer: string;
  cards: ClimateCard[];
  links: ClimateLink[];
  layout?: {
    type?: 'force' | 'spine' | 'waves' | string;
    col_gap?: number;
    row_gap?: number;
  };
}

const COLLECTION = 'climate-map';

const WAVES: { id: ClimateWave; label: string; color: string; bg: string; border: string }[] = [
  { id: 'activities', label: 'Activities', color: 'var(--panel-orange-text)', bg: 'var(--panel-orange-bg)', border: 'var(--panel-orange-border)' },
  { id: 'emissions', label: 'Emissions', color: 'var(--panel-red-text)', bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)' },
  { id: 'atmosphere', label: 'Atmosphere', color: 'var(--panel-blue-text)', bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)' },
  { id: 'energy', label: 'Energy budget', color: 'var(--panel-purple-text)', bg: 'var(--panel-purple-bg)', border: 'var(--panel-purple-border)' },
  { id: 'climate', label: 'Climate', color: 'var(--panel-teal-text)', bg: 'var(--panel-teal-bg)', border: 'var(--panel-teal-border)' },
  { id: 'impacts', label: 'Impacts', color: 'var(--heading-color)', bg: 'var(--card-bg)', border: 'var(--border-color)' },
  { id: 'responses', label: 'Responses', color: 'var(--panel-green-text)', bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)' },
];

const WAVE_META = Object.fromEntries(WAVES.map((w) => [w.id, w])) as Record<ClimateWave, (typeof WAVES)[number]>;
const WAVE_INDEX = Object.fromEntries(WAVES.map((w, i) => [w.id, i])) as Record<ClimateWave, number>;

const CARD_W = 152;
const CARD_H = 62;
const COL_GAP = 200;
const ROW_GAP = 100;
const PAD_X = 40;
const PAD_Y = 50;

function seedPositions(cards: ClimateCard[], colGap = COL_GAP, rowGap = ROW_GAP): ClimateCard[] {
  const hasGrid = cards.some((c) => c.col != null && c.row != null);
  if (hasGrid) {
    return cards.map((c) => ({
      ...c,
      x: PAD_X + (c.col ?? 0) * colGap,
      y: PAD_Y + (c.row ?? 0) * rowGap,
    }));
  }
  const byWave = new Map<ClimateWave, ClimateCard[]>();
  for (const w of WAVES) byWave.set(w.id, []);
  for (const c of cards) {
    (byWave.get(c.wave) || []).push(c);
  }
  const out: ClimateCard[] = [];
  WAVES.forEach((w, col) => {
    const list = byWave.get(w.id) || [];
    list.forEach((c, row) => {
      out.push({
        ...c,
        x: c.x ?? PAD_X + col * colGap,
        y: c.y ?? PAD_Y + row * rowGap,
      });
    });
  });
  const seen = new Set(out.map((c) => c.id));
  for (const c of cards) {
    if (!seen.has(c.id)) out.push({ ...c, x: c.x ?? 0, y: c.y ?? 0 });
  }
  return out;
}

function normalizeDeck(data: Partial<ClimateDeck>, fallbackName: string): ClimateDeck {
  const cards = (data.cards || []).map((c) => ({
    id: c.id,
    label: c.label || c.id,
    wave: c.wave,
    summary: c.summary || '',
    details: c.details || '',
    key_figures: c.key_figures || '',
    sources: Array.isArray(c.sources) ? c.sources : [],
    tags: c.tags || [],
    col: c.col,
    row: c.row,
    x: c.x,
    y: c.y,
  }));
  const layout = { type: 'spine' as const, col_gap: COL_GAP, row_gap: ROW_GAP, ...(data.layout || {}) };
  // Prefer saved/explicit pixel positions; fall back to col/row (or wave) spine seed
  const hasXY = cards.some((c) => typeof c.x === 'number' && typeof c.y === 'number');
  const positioned = hasXY
    ? cards.map((c) => ({
      ...c,
      x: typeof c.x === 'number' ? c.x : PAD_X,
      y: typeof c.y === 'number' ? c.y : PAD_Y,
    }))
    : seedPositions(cards, layout.col_gap, layout.row_gap);
  return {
    name: data.name || fallbackName,
    description: data.description || '',
    credit: data.credit || '',
    disclaimer: data.disclaimer || '',
    cards: positioned,
    links: (data.links || []).map((l, i) => ({
      id: l.id || `e-${i}`,
      from: l.from,
      to: l.to,
      label: l.label,
    })),
    layout,
  };
}

function edgePath(from: ClimateCard, to: ClimateCard): string {
  const a = { x: (from.x ?? 0) + CARD_W / 2, y: (from.y ?? 0) + CARD_H / 2 };
  const b = { x: (to.x ?? 0) + CARD_W / 2, y: (to.y ?? 0) + CARD_H / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const inset = CARD_W * 0.42;
  const x1 = a.x + (dx / len) * inset;
  const y1 = a.y + (dy / len) * (CARD_H * 0.32);
  const x2 = b.x - (dx / len) * inset;
  const y2 = b.y - (dy / len) * (CARD_H * 0.32);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + Math.min(36, Math.abs(dx) * 0.05) * (dy >= 0 ? 1 : -1);
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function buildChain(
  selectedId: string,
  links: ClimateLink[],
): { upstream: string[]; downstream: string[] } {
  const upstream: string[] = [];
  const downstream: string[] = [];
  const seenUp = new Set<string>([selectedId]);
  const seenDown = new Set<string>([selectedId]);
  const queueUp = [selectedId];
  const queueDown = [selectedId];
  while (queueUp.length) {
    const id = queueUp.shift()!;
    for (const l of links) {
      if (l.to === id && !seenUp.has(l.from)) {
        seenUp.add(l.from);
        upstream.push(l.from);
        queueUp.push(l.from);
      }
    }
  }
  while (queueDown.length) {
    const id = queueDown.shift()!;
    for (const l of links) {
      if (l.from === id && !seenDown.has(l.to)) {
        seenDown.add(l.to);
        downstream.push(l.to);
        queueDown.push(l.to);
      }
    }
  }
  return { upstream: upstream.reverse(), downstream };
}

// ── Force mural (Brainstorm-style) ─────────────────────────

const MuralGraph: React.FC<{
  cards: ClimateCard[];
  links: ClimateLink[];
  selected: string;
  onSelect: (id: string) => void;
  onCardsChange: (cards: ClimateCard[]) => void;
  autoLayoutKey: string;
}> = ({ cards, links, selected, onSelect, onCardsChange, autoLayoutKey }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(0.85);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [simActive, setSimActive] = useState(false);
  const simRef = useRef<number | null>(null);
  const linksRef = useRef(links);
  linksRef.current = links;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onCardsChangeRef = useRef(onCardsChange);
  onCardsChangeRef.current = onCardsChange;
  const [drag, setDrag] = useState<{
    id: string; sx: number; sy: number; ox: number; oy: number;
  } | null>(null);
  const [panDrag, setPanDrag] = useState<{
    mx: number; my: number; px: number; py: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const ranForKey = useRef('');

  const related = useMemo(() => {
    const ids = new Set<string>([selected]);
    for (const l of links) {
      if (l.from === selected || l.to === selected) {
        ids.add(l.from);
        ids.add(l.to);
      }
    }
    return ids;
  }, [links, selected]);

  const byId = useMemo(() => {
    const m = new Map<string, ClimateCard>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const stopSim = useCallback(() => {
    if (simRef.current != null) {
      cancelAnimationFrame(simRef.current);
      simRef.current = null;
    }
    setSimActive(false);
  }, []);

  const centerOnCards = useCallback((ns: ClimateCard[]) => {
    if (ns.length === 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const z = zoomRef.current;
    const cx = ns.reduce((s, n) => s + (n.x ?? 0) + CARD_W / 2, 0) / ns.length;
    const cy = ns.reduce((s, n) => s + (n.y ?? 0) + CARD_H / 2, 0) / ns.length;
    setPan({ x: r.width / 2 - cx * z, y: r.height / 2 - cy * z });
  }, []);

  const startSim = useCallback((opts?: { resetSeed?: boolean }) => {
    stopSim();
    setSimActive(true);

    if (opts?.resetSeed) {
      const seeded = seedPositions(
        cardsRef.current.map((c) => ({ ...c, x: undefined, y: undefined })),
      );
      onCardsChangeRef.current(seeded);
      cardsRef.current = seeded;
    }

    const REPULSION = 90_000;
    const SPRING_K = 0.006;
    const SPRING_LEN = 260;
    const WAVE_PULL = 0.035;
    const DAMPING = 0.86;
    const DT = 0.85;
    const MAX_ITER = 520;

    let iter = 0;
    const vx: Record<string, number> = {};
    const vy: Record<string, number> = {};

    const tick = () => {
      const prev = cardsRef.current;
      const ns = prev.map((n) => ({ ...n }));
      const idIdx: Record<string, number> = {};
      ns.forEach((n, i) => { idIdx[n.id] = i; });

      for (const n of ns) {
        if (!(n.id in vx)) { vx[n.id] = 0; vy[n.id] = 0; }
      }

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i];
          const b = ns[j];
          let dx = ((b.x ?? 0) + CARD_W / 2) - ((a.x ?? 0) + CARD_W / 2);
          let dy = ((b.y ?? 0) + CARD_H / 2) - ((a.y ?? 0) + CARD_H / 2);
          const dist2 = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(dist2);
          const force = REPULSION / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          vx[a.id] -= fx; vy[a.id] -= fy;
          vx[b.id] += fx; vy[b.id] += fy;
        }
      }

      for (const lk of linksRef.current) {
        const ai = idIdx[lk.from];
        const bi = idIdx[lk.to];
        if (ai == null || bi == null) continue;
        const a = ns[ai];
        const b = ns[bi];
        const dx = ((b.x ?? 0) + CARD_W / 2) - ((a.x ?? 0) + CARD_W / 2);
        const dy = ((b.y ?? 0) + CARD_H / 2) - ((a.y ?? 0) + CARD_H / 2);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - SPRING_LEN;
        const force = SPRING_K * displacement;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vx[a.id] += fx; vy[a.id] += fy;
        vx[b.id] -= fx; vy[b.id] -= fy;
      }

      // Soft column bias so waves still read left → right
      for (const n of ns) {
        const col = WAVE_INDEX[n.wave] ?? 0;
        const targetX = PAD_X + col * COL_GAP;
        vx[n.id] += (targetX - (n.x ?? 0)) * WAVE_PULL;
        vx[n.id] *= DAMPING;
        vy[n.id] *= DAMPING;
        n.x = (n.x ?? 0) + vx[n.id] * DT;
        n.y = (n.y ?? 0) + vy[n.id] * DT;
      }

      cardsRef.current = ns;
      onCardsChangeRef.current(ns);

      iter++;
      if (iter < MAX_ITER) {
        simRef.current = requestAnimationFrame(tick);
      } else {
        simRef.current = null;
        setSimActive(false);
        requestAnimationFrame(() => centerOnCards(cardsRef.current));
      }
    };

    simRef.current = requestAnimationFrame(tick);
  }, [stopSim, centerOnCards]);

  // Center the fixed spine when the deck loads (force layout is opt-in)
  useEffect(() => {
    if (!autoLayoutKey || ranForKey.current === autoLayoutKey) return;
    ranForKey.current = autoLayoutKey;
    const t = window.setTimeout(() => {
      centerOnCards(cardsRef.current);
    }, 40);
    return () => window.clearTimeout(t);
  }, [autoLayoutKey, centerOnCards]);

  useEffect(() => () => {
    if (simRef.current != null) cancelAnimationFrame(simRef.current);
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (drag) {
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
        const z = zoomRef.current;
        onCardsChangeRef.current(
          cardsRef.current.map((n) => (
            n.id === drag.id
              ? { ...n, x: drag.ox + dx / z, y: drag.oy + dy / z }
              : n
          )),
        );
      }
      if (panDrag) {
        setPan({
          x: panDrag.px + e.clientX - panDrag.mx,
          y: panDrag.py + e.clientY - panDrag.my,
        });
      }
    };
    const up = () => {
      if (drag && !didDragRef.current) onSelect(drag.id);
      setDrag(null);
      setPanDrag(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, panDrag, onSelect]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const dir = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((z) => {
        const nz = Math.max(0.2, Math.min(3, z * dir));
        setPan((p) => ({
          x: mx - (mx - p.x) * (nz / z),
          y: my - (my - p.y) * (nz / z),
        }));
        return nz;
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (!t.classList.contains('cm-bg')) return;
    setPanDrag({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
    e.preventDefault();
  };

  const onNodeDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (simActive) stopSim();
    didDragRef.current = false;
    const n = cardsRef.current.find((c) => c.id === id);
    if (n) setDrag({ id, sx: e.clientX, sy: e.clientY, ox: n.x ?? 0, oy: n.y ?? 0 });
    e.preventDefault();
  };

  return (
    <Box
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      bg="var(--surface-muted)"
      overflow="hidden"
      h={{ base: '420px', lg: 'min(70vh, 720px)' }}
      minH="420px"
      display="flex"
      flexDirection="column"
    >
      <HStack px={2} py={1.5} gap={2} borderBottom="1px solid" borderColor="var(--border-color)" flexWrap="wrap">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            const seeded = seedPositions(
              cardsRef.current.map((c) => ({ ...c, x: undefined, y: undefined })),
            );
            onCardsChangeRef.current(seeded);
            cardsRef.current = seeded;
            stopSim();
            requestAnimationFrame(() => centerOnCards(seeded));
          }}
        >
          Reset spine
        </Button>
        <Button
          size="xs"
          variant={simActive ? 'solid' : 'outline'}
          colorPalette="blue"
          onClick={() => startSim()}
          disabled={simActive}
        >
          <Zap size={12} /> {simActive ? 'Laying out…' : 'Force layout'}
        </Button>
        {simActive && (
          <Button size="xs" variant="ghost" onClick={stopSim}>Stop</Button>
        )}
        <Text fontSize="2xs" color="var(--empty-text)">
          Left→right story · drag to pan · scroll to zoom
        </Text>
        <HStack gap={2} ml="auto" flexWrap="wrap">
          {WAVES.map((w) => (
            <HStack key={w.id} gap={1}>
              <Box w="8px" h="8px" borderRadius="sm" bg={w.bg} border="1px solid" borderColor={w.border} />
              <Text fontSize="2xs" color="var(--muted-text)">{w.label}</Text>
            </HStack>
          ))}
        </HStack>
      </HStack>

      <Box flex="1" minH={0} position="relative">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ display: 'block', cursor: panDrag ? 'grabbing' : 'default' }}
          onMouseDown={onBgDown}
        >
          <defs>
            <pattern id="cm-dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill="var(--border-color)" opacity="0.7" />
            </pattern>
            <marker
              id="cm-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-text)" />
            </marker>
            <marker
              id="cm-arrow-hot"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--icon-color)" />
            </marker>
          </defs>

          <rect className="cm-bg" width="100%" height="100%" fill="var(--surface-muted)" />
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <rect className="cm-bg" x={-4000} y={-4000} width={8000} height={8000} fill="url(#cm-dots)" />

            {links.map((l) => {
              const a = byId.get(l.from);
              const b = byId.get(l.to);
              if (!a || !b) return null;
              const hot = l.from === selected || l.to === selected;
              const dim = !!selected && !hot;
              const d = edgePath(a, b);
              const pathId = `cm-path-${l.id}`;
              return (
                <g key={l.id} opacity={dim ? 0.12 : hot ? 1 : 0.45}>
                  <path
                    id={pathId}
                    d={d}
                    fill="none"
                    stroke={hot ? 'var(--icon-color)' : 'var(--muted-text)'}
                    strokeWidth={hot ? 2.4 : 1.4}
                    markerEnd={hot ? 'url(#cm-arrow-hot)' : 'url(#cm-arrow)'}
                  />
                  {l.label && hot && (
                    <text fontSize="9" fill="var(--muted-text)" fontWeight="600" dy={-5}>
                      <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                        {l.label}
                      </textPath>
                    </text>
                  )}
                </g>
              );
            })}

            {cards.map((c) => {
              const meta = WAVE_META[c.wave];
              const isSel = c.id === selected;
              const isRel = related.has(c.id);
              const dim = !!selected && !isRel;
              return (
                <g
                  key={c.id}
                  transform={`translate(${c.x ?? 0}, ${c.y ?? 0})`}
                  style={{ cursor: 'grab' }}
                  opacity={dim ? 0.25 : 1}
                  onMouseDown={(e) => onNodeDown(c.id, e)}
                >
                  <rect
                    width={CARD_W}
                    height={CARD_H}
                    rx={8}
                    fill={isSel ? meta.bg : 'var(--card-bg)'}
                    stroke={isSel ? meta.color : meta.border}
                    strokeWidth={isSel ? 2.25 : 1.25}
                  />
                  <text
                    x={CARD_W / 2}
                    y={CARD_H / 2 + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill={meta.color}
                    style={{ pointerEvents: 'none' }}
                  >
                    {c.label.length > 18 ? `${c.label.slice(0, 17)}…` : c.label}
                  </text>
                  <title>{c.label}: {c.summary}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </Box>
    </Box>
  );
};

// ── Main page ──────────────────────────────────────────────

const ClimateMap: React.FC = () => {
  const { deck: urlDeck } = useParams<{ deck?: string }>();
  const navigate = useNavigate();

  const [storeKey, setStoreKey] = useState('');
  const [deck, setDeck] = useState<ClimateDeck | null>(null);
  const [selected, setSelected] = useState('');
  const [savedDecks, setSavedDecks] = useState<string[]>([]);
  const [editingMeta, setEditingMeta] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const deckRef = useRef<ClimateDeck | null>(null);
  deckRef.current = deck;

  const selectedCard = useMemo(
    () => deck?.cards.find((c) => c.id === selected) || deck?.cards[0],
    [deck, selected],
  );

  const chain = useMemo(() => {
    if (!deck || !selectedCard) return { upstream: [] as string[], downstream: [] as string[] };
    return buildChain(selectedCard.id, deck.links);
  }, [deck, selectedCard]);

  const labelOf = useCallback(
    (id: string) => deck?.cards.find((c) => c.id === id)?.label || id,
    [deck],
  );

  const applyDeck = useCallback((normalized: ClimateDeck, key: string) => {
    setStoreKey(key);
    setDeck(normalized);
    setSelected(normalized.cards[0]?.id || '');
    setDirty(false);
    setEditingMeta(false);
  }, []);

  const doLoad = useCallback(async (name: string) => {
    try {
      const data = await jsonStore.get<ClimateDeck>(COLLECTION, name);
      applyDeck(normalizeDeck(data, name), name);
    } catch {
      setSaveStatus('Load failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [applyDeck]);

  useEffect(() => {
    jsonStore.list(COLLECTION).then(setSavedDecks).catch(() => { });
    if (urlDeck) {
      doLoad(urlDeck);
    } else {
      setStoreKey('');
      setDeck(null);
      setSelected('');
      setDirty(false);
    }
  }, [urlDeck, doLoad]);

  const loadDeck = (name: string) => {
    navigate(`/scratch/climate-map/${encodeURIComponent(name)}`);
  };

  const saveDeck = async () => {
    const current = deckRef.current;
    if (!current || isStaticMode) return;
    const name = (storeKey || current.name).trim();
    if (!name) return;
    const key = name.replace(/[^a-zA-Z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '') || name;
    try {
      // Persist current card pixel positions (drag / force layout)
      const data: ClimateDeck = {
        ...current,
        name: current.name.trim() || key,
        cards: current.cards.map((c) => ({
          ...c,
          x: c.x ?? 0,
          y: c.y ?? 0,
        })),
        layout: { ...current.layout, type: current.layout?.type || 'spine' },
      };
      await jsonStore.put(COLLECTION, key, data);
      setDeck(data);
      deckRef.current = data;
      setStoreKey(key);
      setDirty(false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
      if (!savedDecks.includes(key)) setSavedDecks((prev) => [...prev, key].sort());
      navigate(`/scratch/climate-map/${encodeURIComponent(key)}`, { replace: true });
    } catch {
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const patchDeck = (patch: Partial<ClimateDeck>) => {
    setDeck((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const onCardsChange = useCallback((cards: ClimateCard[]) => {
    setDeck((prev) => {
      if (!prev) return prev;
      const next = { ...prev, cards };
      deckRef.current = next;
      return next;
    });
    setDirty(true);
  }, []);

  const panel = selectedCard ? WAVE_META[selectedCard.wave] : null;

  return (
    <Box h="100%" display="flex" flexDirection="column" bg="var(--card-bg)">
      <Flex px={4} py={3} borderBottom="1px solid" borderColor="var(--border-color)" align="center" gap={3}>
        <Heading size="lg" color="var(--heading-color)" flex={1}>
          Climate Map
        </Heading>
        {deck && (
          <Badge variant="subtle" colorPalette="blue">
            {deck.cards.length} cards · {deck.links.length} links
          </Badge>
        )}
      </Flex>

      <Box px={4} py={2} borderBottom="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
        <Flex gap={3} align="center" wrap="wrap">
          {!isStaticMode && deck && (
            <>
              <Button size="sm" colorPalette="blue" onClick={saveDeck} disabled={!dirty && !!storeKey}>
                Save
              </Button>
              {saveStatus && (
                <Text fontSize="sm" color={saveStatus === 'Saved' ? 'green.500' : 'red.400'}>{saveStatus}</Text>
              )}
              {dirty && !saveStatus && (
                <Text fontSize="xs" color="orange.400">unsaved changes</Text>
              )}
            </>
          )}
          {savedDecks.length > 0 && (
            <>
              <Box borderLeft="1px solid" borderColor="var(--border-color)" h="24px" mx={1} />
              <FolderOpen size={14} color="var(--muted-text)" />
              {savedDecks.map((name) => (
                <Button
                  key={name}
                  size="xs"
                  variant={name === storeKey ? 'solid' : 'outline'}
                  colorPalette={name === storeKey ? 'blue' : undefined}
                  onClick={() => loadDeck(name)}
                >
                  {name}
                </Button>
              ))}
            </>
          )}
        </Flex>
      </Box>

      <Box flex={1} overflow="auto" p={4}>
        {!urlDeck && !deck && savedDecks.length === 0 ? (
          <Flex direction="column" align="center" justify="center" minH="280px" gap={3}>
            <Text color="var(--muted-text)" textAlign="center" maxW="lg">
              No climate decks yet. Add a JSON deck under <Text as="span" fontFamily="mono">uploads/data/climate-map/</Text>.
            </Text>
          </Flex>
        ) : !urlDeck && !deck && savedDecks.length > 0 ? (
          <VStack align="stretch" gap={4} maxW="3xl" mx="auto" pt={6}>
            <Text color="var(--muted-text)" textAlign="center">
              Choose a mural to explore cause and effect — with sources on every card.
            </Text>
            <Flex gap={3} flexWrap="wrap" justify="center">
              {savedDecks.map((name) => (
                <Button key={name} onClick={() => loadDeck(name)} variant="outline">
                  {name}
                </Button>
              ))}
            </Flex>
          </VStack>
        ) : deck && (
          <VStack align="stretch" gap={5} maxW="100%" mx="auto">
            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <Box
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                minW={0}
                p={4}
                borderRadius="lg"
                border="1px solid"
                borderColor="var(--border-color)"
                bg="var(--card-bg)"
              >
                <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                  <Heading size="md" color="var(--heading-color)">{deck.name}</Heading>
                  {!isStaticMode && (
                    <Button size="xs" variant="ghost" onClick={() => setEditingMeta((v) => !v)}>
                      {editingMeta ? 'Done' : 'Edit text'}
                    </Button>
                  )}
                </HStack>
                {editingMeta && !isStaticMode ? (
                  <VStack align="stretch" gap={2}>
                    <Textarea
                      size="sm"
                      rows={3}
                      value={deck.description}
                      onChange={(e) => patchDeck({ description: e.target.value })}
                      bg="var(--input-bg)"
                      borderColor="var(--border-color)"
                    />
                    <Textarea
                      size="sm"
                      rows={2}
                      value={deck.credit}
                      onChange={(e) => patchDeck({ credit: e.target.value })}
                      bg="var(--input-bg)"
                      borderColor="var(--border-color)"
                    />
                    <Textarea
                      size="sm"
                      rows={2}
                      value={deck.disclaimer}
                      onChange={(e) => patchDeck({ disclaimer: e.target.value })}
                      bg="var(--input-bg)"
                      borderColor="var(--border-color)"
                    />
                  </VStack>
                ) : (
                  <VStack align="stretch" gap={2}>
                    {deck.description && (
                      <Text fontSize="sm" color="var(--muted-text)" whiteSpace="pre-wrap">{deck.description}</Text>
                    )}
                    {deck.credit && (
                      <Text fontSize="2xs" color="var(--empty-text)">{deck.credit}</Text>
                    )}
                    {deck.disclaimer && (
                      <Text fontSize="2xs" color="var(--empty-text)">{deck.disclaimer}</Text>
                    )}
                  </VStack>
                )}
              </Box>

              <Box
                flex={{ lg: '1 1 50%' }}
                w={{ base: '100%', lg: '50%' }}
                maxW={{ lg: '50%' }}
                minW={0}
                p={4}
                borderRadius="lg"
                border="1px solid"
                borderColor="var(--border-color)"
                bg="var(--card-bg)"
                overflowX="auto"
              >
                <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                  Causal chain
                </Text>
                {selectedCard ? (
                  <HStack gap={1} flexWrap="wrap" align="center">
                    {chain.upstream.map((id) => (
                      <React.Fragment key={`up-${id}`}>
                        <Button size="xs" variant="ghost" onClick={() => setSelected(id)}>
                          {labelOf(id)}
                        </Button>
                        <Text fontSize="2xs" color="var(--empty-text)">→</Text>
                      </React.Fragment>
                    ))}
                    <Badge colorPalette="blue" variant="solid">{selectedCard.label}</Badge>
                    {chain.downstream.map((id) => (
                      <React.Fragment key={`dn-${id}`}>
                        <Text fontSize="2xs" color="var(--empty-text)">→</Text>
                        <Button size="xs" variant="ghost" onClick={() => setSelected(id)}>
                          {labelOf(id)}
                        </Button>
                      </React.Fragment>
                    ))}
                  </HStack>
                ) : (
                  <Text fontSize="sm" color="var(--empty-text)">Select a card on the mural</Text>
                )}
                <Text fontSize="2xs" color="var(--empty-text)" mt={3}>
                  Upstream causes → selected → downstream effects.
                </Text>
              </Box>
            </Flex>

            <Flex direction={{ base: 'column', lg: 'row' }} gap={5} align="stretch">
              <Box
                flex={{ lg: '1 1 42%' }}
                w={{ base: '100%', lg: '42%' }}
                maxW={{ lg: '42%' }}
                minW={0}
                order={{ base: 2, lg: 1 }}
              >
                {selectedCard && panel ? (
                  <Box p={5} borderRadius="xl" border="1px solid" borderColor={panel.border} bg={panel.bg}>
                    <HStack mb={3} justify="space-between" flexWrap="wrap" gap={2}>
                      <HStack>
                        <Heading size="md" color={panel.color}>{selectedCard.label}</Heading>
                        <Badge variant="outline" fontSize="2xs">{WAVE_META[selectedCard.wave].label}</Badge>
                      </HStack>
                    </HStack>
                    <VStack align="stretch" gap={3}>
                      <Text fontSize="md" fontWeight="medium" color="var(--heading-color)">
                        {selectedCard.summary}
                      </Text>
                      {selectedCard.key_figures && (
                        <Box p={3} borderRadius="md" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)">
                          <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={1}>
                            Key figures
                          </Text>
                          <Text fontSize="sm" color="var(--heading-color)">{selectedCard.key_figures}</Text>
                        </Box>
                      )}
                      {selectedCard.details && (
                        <Text fontSize="sm" color="var(--heading-color)" whiteSpace="pre-wrap" lineHeight="1.6">
                          {selectedCard.details}
                        </Text>
                      )}
                      {(selectedCard.tags || []).length > 0 && (
                        <Flex gap={1} flexWrap="wrap">
                          {selectedCard.tags!.map((t) => (
                            <Badge key={t} variant="subtle" size="sm">{t}</Badge>
                          ))}
                        </Flex>
                      )}
                      <Box>
                        <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                          Sources
                        </Text>
                        <VStack align="stretch" gap={2}>
                          {(selectedCard.sources || []).length === 0 ? (
                            <Text fontSize="sm" color="var(--empty-text)">No sources listed.</Text>
                          ) : (
                            selectedCard.sources.map((s, i) => (
                              <Box
                                key={`${s.label}-${i}`}
                                p={3}
                                borderRadius="md"
                                bg="var(--card-bg)"
                                border="1px solid"
                                borderColor="var(--border-color)"
                              >
                                {s.url ? (
                                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                    <HStack gap={1.5} color={panel.color}>
                                      <Text fontSize="sm" fontWeight="600">{s.label}</Text>
                                      <ExternalLink size={12} />
                                    </HStack>
                                  </a>
                                ) : (
                                  <Text fontSize="sm" fontWeight="600" color="var(--heading-color)">{s.label}</Text>
                                )}
                                {s.note && (
                                  <Text fontSize="2xs" color="var(--muted-text)" mt={1}>{s.note}</Text>
                                )}
                              </Box>
                            ))
                          )}
                        </VStack>
                      </Box>
                      <Box>
                        <Text fontSize="xs" fontWeight="semibold" color="var(--muted-text)" mb={2}>
                          Direct links
                        </Text>
                        <VStack align="stretch" gap={1}>
                          {deck.links.filter((l) => l.to === selectedCard.id).map((l) => (
                            <Button key={l.id} size="xs" variant="outline" alignSelf="flex-start" onClick={() => setSelected(l.from)}>
                              ← {labelOf(l.from)}{l.label ? ` (${l.label})` : ''}
                            </Button>
                          ))}
                          {deck.links.filter((l) => l.from === selectedCard.id).map((l) => (
                            <Button key={l.id} size="xs" variant="outline" alignSelf="flex-start" onClick={() => setSelected(l.to)}>
                              → {labelOf(l.to)}{l.label ? ` (${l.label})` : ''}
                            </Button>
                          ))}
                        </VStack>
                      </Box>
                    </VStack>
                  </Box>
                ) : (
                  <Box p={5} borderRadius="xl" border="1px dashed" borderColor="var(--border-color)">
                    <Text fontSize="sm" color="var(--empty-text)">Select a card on the mural</Text>
                  </Box>
                )}
              </Box>

              <Box
                flex={{ lg: '1 1 58%' }}
                w={{ base: '100%', lg: '58%' }}
                maxW={{ lg: '58%' }}
                minW={0}
                order={{ base: 1, lg: 2 }}
              >
                <MuralGraph
                  cards={deck.cards}
                  links={deck.links}
                  selected={selectedCard?.id || ''}
                  onSelect={setSelected}
                  onCardsChange={onCardsChange}
                  autoLayoutKey={storeKey || deck.name}
                />
              </Box>
            </Flex>
          </VStack>
        )}
      </Box>
    </Box>
  );
};

export default ClimateMap;
