import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Button, Flex, Heading, HStack, IconButton, Input, Text, Textarea, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { useParams, useNavigate } from 'react-router-dom';
import { jsonStore, isStaticMode } from '../services/jsonstore';
import { Plus, Save, Trash2, Link2, MousePointer, X, Pencil, Eye, Lightbulb, FileDown, Zap, List, ChevronRight, ChevronLeft } from 'lucide-react';
import { marked } from 'marked';

// ─────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────

type Timeframe = 'short-term' | 'long-term' | 'unset';
type Scope = 'personal' | 'societal' | 'regional' | 'worldwide' | 'unset';
type NodeKind = 'issue' | 'solution';
type LinkKind = 'causes' | 'mitigates';
type Mode = 'select' | 'link';

interface IssueNode {
  id: string;
  title: string;
  description: string;
  timeframe: Timeframe;
  scope: Scope;
  kind?: NodeKind;
  x: number;
  y: number;
}

interface IssueLink {
  id: string;
  from: string;
  to: string;
  label: string;
  weight?: number;
  kind?: LinkKind;
}

interface BrainstormData {
  nodes: IssueNode[];
  links: IssueLink[];
}

const COLLECTION = 'brainstorm';
const NODE_W = 200;
const NODE_H = 64;
const NODE_R = 10;

const SCOPE_COLORS: Record<Scope, string> = {
  personal: '#6366F1',
  societal: '#10B981',
  regional: '#F59E0B',
  worldwide: '#EF4444',
  unset: '#94A3B8',
};

const SCOPE_LABELS: Record<Scope, string> = {
  personal: 'Personal',
  societal: 'Societal',
  regional: 'Regional',
  worldwide: 'Worldwide',
  unset: 'Unscoped',
};

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  'short-term': 'Short-term',
  'long-term': 'Long-term',
  unset: 'Unset',
};

const ALL_SCOPES: Scope[] = ['personal', 'societal', 'regional', 'worldwide', 'unset'];
const FILTER_SCOPES: Scope[] = ['personal', 'societal', 'regional', 'worldwide'];
const ALL_TIMEFRAMES: Timeframe[] = ['short-term', 'long-term', 'unset'];
const FILTER_TIMEFRAMES: Timeframe[] = ['short-term', 'long-term'];

let _seq = 0;
function uid(): string { return `n${Date.now()}_${_seq++}`; }

// ─────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

const mdStyles: React.CSSProperties = {
  lineHeight: 1.7,
  fontSize: '0.95rem',
  wordBreak: 'break-word',
};

const mdCss = `
.md-body h1,.md-body h2,.md-body h3 { margin:0.8em 0 0.4em; font-weight:600; }
.md-body h1 { font-size:1.4rem; }
.md-body h2 { font-size:1.2rem; }
.md-body h3 { font-size:1.05rem; }
.md-body p  { margin:0.4em 0; }
.md-body ul,.md-body ol { margin:0.4em 0; padding-left:1.4em; }
.md-body li { margin:0.15em 0; }
.md-body a  { color:#6366F1; text-decoration:underline; }
.md-body code { background:rgba(0,0,0,0.06); padding:0.15em 0.35em; border-radius:4px; font-size:0.88em; }
.md-body pre { background:rgba(0,0,0,0.06); padding:0.8em; border-radius:6px; overflow-x:auto; margin:0.6em 0; }
.md-body pre code { background:none; padding:0; }
.md-body blockquote { border-left:3px solid #a0aec0; padding-left:0.8em; margin:0.6em 0; color:#718096; }
.md-body hr { border:none; border-top:1px solid #e2e8f0; margin:1em 0; }
`;

function RenderedMarkdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text]);
  return (
    <>
      <style>{mdCss}</style>
      <div
        className="md-body"
        style={mdStyles}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

// ─────────────────────────────────────────
// Link anchor logic
// ─────────────────────────────────────────

type Anchor = 'top-left' | 'top' | 'top-right' | 'right' |
              'bottom-right' | 'bottom' | 'bottom-left' | 'left';

function anchorPos(n: IssueNode, a: Anchor): { x: number; y: number } {
  switch (a) {
    case 'top-left':     return { x: n.x + NODE_R,            y: n.y };
    case 'top':          return { x: n.x + NODE_W / 2,        y: n.y };
    case 'top-right':    return { x: n.x + NODE_W - NODE_R,   y: n.y };
    case 'right':        return { x: n.x + NODE_W,            y: n.y + NODE_H / 2 };
    case 'bottom-right': return { x: n.x + NODE_W - NODE_R,   y: n.y + NODE_H };
    case 'bottom':       return { x: n.x + NODE_W / 2,        y: n.y + NODE_H };
    case 'bottom-left':  return { x: n.x + NODE_R,            y: n.y + NODE_H };
    case 'left':         return { x: n.x,                     y: n.y + NODE_H / 2 };
  }
}

function anchorDir(a: Anchor): { dx: number; dy: number } {
  const D = 0.707;
  switch (a) {
    case 'top-left':     return { dx: -D, dy: -D };
    case 'top':          return { dx: 0,  dy: -1 };
    case 'top-right':    return { dx: D,  dy: -D };
    case 'right':        return { dx: 1,  dy: 0 };
    case 'bottom-right': return { dx: D,  dy: D };
    case 'bottom':       return { dx: 0,  dy: 1 };
    case 'bottom-left':  return { dx: -D, dy: D };
    case 'left':         return { dx: -1, dy: 0 };
  }
}

function pickAnchor(deg: number): Anchor {
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  if (deg > -22.5  && deg <= 22.5)   return 'right';
  if (deg > 22.5   && deg <= 67.5)   return 'bottom-right';
  if (deg > 67.5   && deg <= 112.5)  return 'bottom';
  if (deg > 112.5  && deg <= 157.5)  return 'bottom-left';
  if (deg > 157.5  || deg <= -157.5) return 'left';
  if (deg > -157.5 && deg <= -112.5) return 'top-left';
  if (deg > -112.5 && deg <= -67.5)  return 'top';
  return 'top-right';
}

function computeLink(a: IssueNode, b: IssueNode) {
  const cx1 = a.x + NODE_W / 2, cy1 = a.y + NODE_H / 2;
  const cx2 = b.x + NODE_W / 2, cy2 = b.y + NODE_H / 2;
  const angle = Math.atan2(cy2 - cy1, cx2 - cx1) * 180 / Math.PI;

  const srcA = pickAnchor(angle);
  const dstA = pickAnchor(angle + 180);

  const p1 = anchorPos(a, srcA);
  const p2 = anchorPos(b, dstA);
  const d1 = anchorDir(srcA);
  const d2 = anchorDir(dstA);

  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const off = Math.min(dist * 0.25, 50);

  const cp2x = p2.x + d2.dx * off;
  const cp2y = p2.y + d2.dy * off;
  const path = `M${p1.x},${p1.y} C${p1.x + d1.dx * off},${p1.y + d1.dy * off} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  const endAngle = Math.atan2(p2.y - cp2y, p2.x - cp2x);
  return { path, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, endAngle };
}

function arrowHead(x: number, y: number, angle: number, size: number): string {
  const spread = 0.45;
  const x1 = x - size * Math.cos(angle - spread);
  const y1 = y - size * Math.sin(angle - spread);
  const x2 = x - size * Math.cos(angle + spread);
  const y2 = y - size * Math.sin(angle + spread);
  return `${x},${y} ${x1},${y1} ${x2},${y2}`;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

const Brainstorm = () => {
  const { project: urlProject } = useParams<{ project?: string }>();
  const navigate = useNavigate();

  const [nodes, setNodes] = useState<IssueNode[]>([]);
  const [links, setLinks] = useState<IssueLink[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<Mode>('select');
  const [selId, setSelId] = useState<string | null>(null);
  const [selKind, setSelKind] = useState<'node' | 'link' | null>(null);
  const [linkSrc, setLinkSrc] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string; sx: number; sy: number; ox: number; oy: number;
  } | null>(null);
  const [panDrag, setPanDrag] = useState<{
    mx: number; my: number; px: number; py: number;
  } | null>(null);
  const [fTime, setFTime] = useState<Timeframe | 'all'>('all');
  const [fScope, setFScope] = useState<Scope | 'all'>('all');
  const [fKind, setFKind] = useState<NodeKind | 'all'>('all');
  const [projName, setProjName] = useState('default');
  const [projects, setProjects] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [modalNodeId, setModalNodeId] = useState<string | null>(null);
  const [mdEditing, setMdEditing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importErr, setImportErr] = useState('');
  const [listOpen, setListOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const didDragRef = useRef(false);

  // ── Theme ──
  const bg = useColorModeValue('#f7f8fa', '#1a1b2e');
  const dotFill = useColorModeValue('#dde0e6', '#2d2f45');
  const cardBg = useColorModeValue('#ffffff', '#252740');
  const txt = useColorModeValue('#1a202c', '#e2e8f0');
  const sub = useColorModeValue('#718096', '#a0aec0');
  const wire = useColorModeValue('#a0aec0', '#4a5568');
  const chrome = useColorModeValue('#ffffff', '#1e2035');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const hintBg = useColorModeValue('#EBF8FF', '#1A365D');
  const hintTx = useColorModeValue('#2B6CB0', '#90CDF4');
  const solBg = useColorModeValue('rgba(56,161,105,0.08)', 'rgba(56,161,105,0.12)');
  const solBorder = '#38A169';
  const mitigateCol = '#38A169';

  // ── Helpers ──
  const toWorld = useCallback((cx: number, cy: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (cx - r.left - pan.x) / zoom,
      y: (cy - r.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const matches = useCallback((n: IssueNode) => {
    if (fTime !== 'all' && n.timeframe !== fTime) return false;
    if (fScope !== 'all' && n.scope !== fScope) return false;
    if (fKind !== 'all' && (n.kind || 'issue') !== fKind) return false;
    return true;
  }, [fTime, fScope, fKind]);

  const centerOnNodes = useCallback((ns: IssueNode[]) => {
    if (ns.length === 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const cx = ns.reduce((s, n) => s + n.x + NODE_W / 2, 0) / ns.length;
    const cy = ns.reduce((s, n) => s + n.y + NODE_H / 2, 0) / ns.length;
    setPan({ x: r.width / 2 - cx * zoom, y: r.height / 2 - cy * zoom });
  }, [zoom]);

  const focusNode = useCallback((node: IssueNode) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const targetZoom = 1.4;
    const cx = node.x + NODE_W / 2;
    const cy = node.y + NODE_H / 2;
    setZoom(targetZoom);
    setPan({ x: r.width / 2 - cx * targetZoom, y: r.height / 2 - cy * targetZoom });
    select(node.id, 'node');
    setModalNodeId(node.id);
    setMdEditing(false);
  }, []);

  // ── Persistence ──
  const loadProject = useCallback(async (name: string) => {
    try {
      const d = await jsonStore.get<BrainstormData>(COLLECTION, name);
      setNodes(d.nodes || []);
      setLinks(d.links || []);
      setProjName(name);
      deselect();
      requestAnimationFrame(() => centerOnNodes(d.nodes || []));
    } catch {
      setStatus('Load error');
      setTimeout(() => setStatus(''), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = urlProject || 'default';
    jsonStore.list(COLLECTION).then(p => {
      setProjects(p);
    }).catch(() => {});
    loadProject(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProject]);

  const save = async () => {
    const name = projName.trim();
    if (!name) return;
    try {
      await jsonStore.put(COLLECTION, name, { nodes, links } as BrainstormData);
      setStatus('Saved');
      setProjects(await jsonStore.list(COLLECTION));
      navigate(`/scratch/brainstorm/${encodeURIComponent(name)}`, { replace: true });
    } catch {
      setStatus('Error');
    }
    setTimeout(() => setStatus(''), 2000);
  };

  const load = (name: string) => {
    navigate(`/scratch/brainstorm/${encodeURIComponent(name)}`);
  };

  // ── Selection ──
  const select = (id: string, kind: 'node' | 'link') => {
    setSelId(id);
    setSelKind(kind);
  };
  const deselect = () => {
    setSelId(null);
    setSelKind(null);
    setLinkSrc(null);
  };

  // ── CRUD ──
  const addNode = (x: number, y: number, kind: NodeKind = 'issue') => {
    const n: IssueNode = {
      id: uid(), title: kind === 'solution' ? 'New Solution' : 'New Issue',
      description: '', timeframe: 'unset', scope: 'unset', kind, x, y,
    };
    setNodes(prev => [...prev, n]);
    select(n.id, 'node');
  };

  const patchNode = (id: string, patch: Partial<IssueNode>) =>
    setNodes(ns => ns.map(n => (n.id === id ? { ...n, ...patch } : n)));

  const rmNode = (id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setLinks(ls => ls.filter(l => l.from !== id && l.to !== id));
    deselect();
  };

  const mkLink = (from: string, to: string) => {
    if (from === to) return;
    if (links.some(l =>
      (l.from === from && l.to === to) || (l.from === to && l.to === from)))
      return;
    const l: IssueLink = { id: uid(), from, to, label: '' };
    setLinks(prev => [...prev, l]);
    select(l.id, 'link');
  };

  const patchLink = (id: string, patch: Partial<IssueLink>) =>
    setLinks(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const rmLink = (id: string) => {
    setLinks(ls => ls.filter(l => l.id !== id));
    deselect();
  };

  const mergeJson = (raw: string) => {
    let data: BrainstormData;
    try {
      data = JSON.parse(raw);
    } catch {
      setImportErr('Invalid JSON');
      return;
    }
    const inNodes: IssueNode[] = Array.isArray(data.nodes) ? data.nodes : [];
    const inLinks: IssueLink[] = Array.isArray(data.links) ? data.links : [];
    if (inNodes.length === 0 && inLinks.length === 0) {
      setImportErr('No nodes or links found in JSON');
      return;
    }
    const existingIds = new Set(nodes.map(n => n.id));
    const idMap: Record<string, string> = {};
    for (const n of inNodes) {
      if (existingIds.has(n.id)) {
        const newId = uid();
        idMap[n.id] = newId;
      } else {
        idMap[n.id] = n.id;
      }
    }
    const mappedNodes = inNodes.map(n => ({ ...n, id: idMap[n.id] ?? n.id }));
    const mappedLinks = inLinks.map(l => ({
      ...l,
      id: uid(),
      from: idMap[l.from] ?? l.from,
      to: idMap[l.to] ?? l.to,
    }));
    setNodes(prev => [...prev, ...mappedNodes]);
    setLinks(prev => [...prev, ...mappedLinks]);
    setImportOpen(false);
    setImportJson('');
    setImportErr('');
    setStatus(`Merged ${mappedNodes.length} nodes, ${mappedLinks.length} links`);
    setTimeout(() => setStatus(''), 3000);
  };

  // ── Force layout simulation ──
  const simRef = useRef<number | null>(null);
  const [simActive, setSimActive] = useState(false);

  const stopSim = useCallback(() => {
    if (simRef.current != null) {
      cancelAnimationFrame(simRef.current);
      simRef.current = null;
    }
    setSimActive(false);
  }, []);

  const startSim = useCallback(() => {
    stopSim();
    setSimActive(true);

    const REPULSION = 80_000;
    const SPRING_K = 0.005;
    const SPRING_LEN = 280;
    const DAMPING = 0.85;
    const DT = 0.8;
    const MAX_ITER = 600;

    let iter = 0;
    const vx: Record<string, number> = {};
    const vy: Record<string, number> = {};

    const tick = () => {
      setNodes(prevNodes => {
        const ns = prevNodes.map(n => ({ ...n }));
        const idIdx: Record<string, number> = {};
        ns.forEach((n, i) => { idIdx[n.id] = i; });

        for (const n of ns) {
          if (!(n.id in vx)) { vx[n.id] = 0; vy[n.id] = 0; }
        }

        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i], b = ns[j];
            let dx = (b.x + NODE_W / 2) - (a.x + NODE_W / 2);
            let dy = (b.y + NODE_H / 2) - (a.y + NODE_H / 2);
            const dist2 = dx * dx + dy * dy;
            const dist = Math.sqrt(dist2) || 1;
            const force = REPULSION / dist2;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            vx[a.id] -= fx; vy[a.id] -= fy;
            vx[b.id] += fx; vy[b.id] += fy;
          }
        }

        setLinks(prevLinks => {
          for (const lk of prevLinks) {
            const ai = idIdx[lk.from], bi = idIdx[lk.to];
            if (ai == null || bi == null) continue;
            const a = ns[ai], b = ns[bi];
            const dx = (b.x + NODE_W / 2) - (a.x + NODE_W / 2);
            const dy = (b.y + NODE_H / 2) - (a.y + NODE_H / 2);
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const displacement = dist - SPRING_LEN;
            const force = SPRING_K * displacement;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            vx[a.id] += fx; vy[a.id] += fy;
            vx[b.id] -= fx; vy[b.id] -= fy;
          }
          return prevLinks;
        });

        for (const n of ns) {
          vx[n.id] *= DAMPING;
          vy[n.id] *= DAMPING;
          n.x += vx[n.id] * DT;
          n.y += vy[n.id] * DT;
        }

        return ns;
      });

      iter++;
      if (iter < MAX_ITER) {
        simRef.current = requestAnimationFrame(tick);
      } else {
        simRef.current = null;
        setSimActive(false);
      }
    };

    simRef.current = requestAnimationFrame(tick);
  }, [stopSim]);

  useEffect(() => () => { if (simRef.current != null) cancelAnimationFrame(simRef.current); }, []);

  // ── Mouse – background ──
  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (!t.classList.contains('bg')) return;
    deselect();
    setPanDrag({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
    e.preventDefault();
  };

  // drag + pan movement
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (drag) {
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
        const z = zoomRef.current;
        setNodes(ns => ns.map(n =>
          n.id === drag.id
            ? { ...n, x: drag.ox + dx / z, y: drag.oy + dy / z }
            : n,
        ));
      }
      if (panDrag) {
        setPan({
          x: panDrag.px + e.clientX - panDrag.mx,
          y: panDrag.py + e.clientY - panDrag.my,
        });
      }
    };
    const up = () => {
      if (drag && !didDragRef.current) {
        setModalNodeId(drag.id);
        setMdEditing(false);
      }
      setDrag(null);
      setPanDrag(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, panDrag]);

  // wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const dir = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(z => {
        const nz = Math.max(0.15, Math.min(4, z * dir));
        setPan(p => ({
          x: mx - (mx - p.x) * (nz / z),
          y: my - (my - p.y) * (nz / z),
        }));
        return nz;
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // ── Mouse – nodes ──
  const onNodeDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (simActive) stopSim();
    if (mode === 'link') {
      if (!linkSrc) {
        setLinkSrc(id);
      } else {
        mkLink(linkSrc, id);
        setLinkSrc(null);
        setMode('select');
      }
      return;
    }
    select(id, 'node');
    didDragRef.current = false;
    const n = nodes.find(nd => nd.id === id);
    if (n) setDrag({ id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y });
    e.preventDefault();
  };

  const onDbl = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isStaticMode) return;
    if (!(e.target as Element).classList.contains('bg')) return;
    const w = toWorld(e.clientX, e.clientY);
    addNode(w.x - NODE_W / 2, w.y - NODE_H / 2);
  };

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (e.key === 'Escape') {
        if (modalNodeId) {
          setModalNodeId(null);
          setMdEditing(false);
          return;
        }
        deselect();
        setMode('select');
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!isStaticMode && (e.key === 'Delete' || e.key === 'Backspace') && selId && !modalNodeId) {
        if (selKind === 'node') rmNode(selId);
        else if (selKind === 'link') rmLink(selId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, selKind, modalNodeId]);

  // ── Derived ──
  const selNode = selKind === 'node' ? nodes.find(n => n.id === selId) ?? null : null;
  const selLink = selKind === 'link' ? links.find(l => l.id === selId) ?? null : null;
  const modalNode = modalNodeId ? nodes.find(n => n.id === modalNodeId) ?? null : null;
  const modalConnections = modalNode
    ? links.filter(l => l.from === modalNode.id || l.to === modalNode.id)
    : [];

  const groupTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const lk of links) {
      if (lk.weight == null) continue;
      const key = lk.label ? `${lk.to}::${lk.label}` : lk.id;
      totals[key] = (totals[key] || 0) + lk.weight;
    }
    return totals;
  }, [links]);

  // ── Render ──
  return (
    <Flex direction="column" h="100%" w="100%">
      {/* ─── Toolbar ─── */}
      <Flex
        bg={chrome} borderBottom="1px solid" borderColor={border}
        px={4} py={2} gap={3} align="center" flexWrap="wrap" flexShrink={0}
      >
        <HStack gap={2}>
          {!isStaticMode && (
            <Input
              size="sm" w="130px" value={projName}
              onChange={e => setProjName(e.target.value)} placeholder="Project"
            />
          )}
          {isStaticMode && (
            <Text fontSize="sm" fontWeight="600">{projName}</Text>
          )}
          {!isStaticMode && (
            <IconButton aria-label="Save" size="sm" onClick={save}>
              <Save size={16} />
            </IconButton>
          )}
          {projects.length > 0 && (
            <select
              value=""
              onChange={e => e.target.value && load(e.target.value)}
              style={{
                fontSize: '0.85rem', padding: '4px 8px', borderRadius: 6,
                border: `1px solid ${border}`, background: 'transparent', color: txt,
              }}
            >
              <option value="">Load…</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {status && <Text fontSize="xs" color="green.400">{status}</Text>}
        </HStack>

        {!isStaticMode && (
          <HStack gap={1}>
            <Button size="sm" variant={mode === 'select' ? 'solid' : 'outline'}
              onClick={() => { setMode('select'); setLinkSrc(null); }}>
              <MousePointer size={14} /> Select
            </Button>
            <Button size="sm" variant={mode === 'link' ? 'solid' : 'outline'}
              onClick={() => setMode('link')}>
              <Link2 size={14} /> Link
            </Button>
          </HStack>
        )}

        <HStack gap={1}>
          <Text fontSize="xs" fontWeight="bold">Scope:</Text>
          <Button size="xs" variant={fScope === 'all' ? 'solid' : 'outline'}
            onClick={() => setFScope('all')}>All</Button>
          {FILTER_SCOPES.map(s => (
            <Button key={s} size="xs"
              variant={fScope === s ? 'solid' : 'outline'}
              onClick={() => setFScope(fScope === s ? 'all' : s)}
              style={fScope === s ? { backgroundColor: SCOPE_COLORS[s], color: '#fff' } : {}}
            >
              <svg width="8" height="8"><circle cx="4" cy="4" r="4" fill={SCOPE_COLORS[s]} /></svg>
              {SCOPE_LABELS[s]}
            </Button>
          ))}
        </HStack>

        <HStack gap={1}>
          <Text fontSize="xs" fontWeight="bold">Time:</Text>
          <Button size="xs" variant={fTime === 'all' ? 'solid' : 'outline'}
            onClick={() => setFTime('all')}>All</Button>
          {FILTER_TIMEFRAMES.map(t => (
            <Button key={t} size="xs"
              variant={fTime === t ? 'solid' : 'outline'}
              onClick={() => setFTime(fTime === t ? 'all' : t)}>
              {TIMEFRAME_LABELS[t]}
            </Button>
          ))}
        </HStack>

        <HStack gap={1}>
          <Text fontSize="xs" fontWeight="bold">Kind:</Text>
          <Button size="xs" variant={fKind === 'all' ? 'solid' : 'outline'}
            onClick={() => setFKind('all')}>All</Button>
          <Button size="xs" variant={fKind === 'issue' ? 'solid' : 'outline'}
            onClick={() => setFKind(fKind === 'issue' ? 'all' : 'issue')}>Issues</Button>
          <Button size="xs" variant={fKind === 'solution' ? 'solid' : 'outline'}
            onClick={() => setFKind(fKind === 'solution' ? 'all' : 'solution')}
            style={fKind === 'solution' ? { backgroundColor: solBorder, color: '#fff' } : {}}>
            <Lightbulb size={12} /> Solutions
          </Button>
        </HStack>

        {!isStaticMode && (
          <>
            <Button size="sm" variant="outline"
              onClick={() => addNode((-pan.x + 200) / zoom, (-pan.y + 150) / zoom)}>
              <Plus size={14} /> Add Issue
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => addNode((-pan.x + 250) / zoom, (-pan.y + 150) / zoom, 'solution')}
              style={{ color: solBorder, borderColor: solBorder }}>
              <Lightbulb size={14} /> Add Solution
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => { setImportOpen(true); setImportErr(''); setImportJson(''); }}>
              <FileDown size={14} /> Import JSON
            </Button>
          </>
        )}
        <Button size="sm"
          variant={simActive ? 'solid' : 'outline'}
          onClick={() => simActive ? stopSim() : startSim()}
          style={simActive ? { backgroundColor: '#6366F1', color: '#fff' } : {}}>
          <Zap size={14} /> {simActive ? 'Stop Layout' : 'Auto Layout'}
        </Button>
      </Flex>

      {/* Link-mode hint */}
      {mode === 'link' && (
        <Box bg={hintBg} px={4} py={1} textAlign="center" flexShrink={0}>
          <Text fontSize="sm" color={hintTx}>
            {linkSrc
              ? 'Click another node to complete the link'
              : 'Click a node to start linking'}
            {' — Escape to cancel'}
          </Text>
        </Box>
      )}

      {/* ─── Canvas ─── */}
      <Box flex={1} position="relative" overflow="hidden">
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{
            position: 'absolute', inset: 0,
            cursor: panDrag ? 'grabbing' : mode === 'link' ? 'crosshair' : 'grab',
          }}
          onMouseDown={onBgDown}
          onDoubleClick={onDbl}
        >
          <defs>
            <pattern
              id="dot-grid" patternUnits="userSpaceOnUse"
              width={20 * zoom} height={20 * zoom}
              x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)}
            >
              <circle cx={1} cy={1} r={0.8} fill={dotFill} />
            </pattern>
            {/* markers removed – arrows drawn per-link for weight scaling */}
            {/* Per-node clip paths for the left color bar */}
            {nodes.map(n => (
              <clipPath key={n.id} id={`c${n.id}`}>
                <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={NODE_R} />
              </clipPath>
            ))}
          </defs>

          <rect className="bg" width="100%" height="100%" fill={bg} />
          <rect className="bg" width="100%" height="100%" fill="url(#dot-grid)" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* ── Links ── */}
            {links.map(lk => {
              const a = nodes.find(n => n.id === lk.from);
              const b = nodes.find(n => n.id === lk.to);
              if (!a || !b) return null;
              const { path, x1, y1, x2, y2, endAngle } = computeLink(a, b);
              const vis = matches(a) && matches(b);
              const sel = selId === lk.id;
              const isMitigate = (lk.kind || 'causes') === 'mitigates';
              const w = lk.weight;
              const gKey = lk.label ? `${lk.to}::${lk.label}` : lk.id;
              const gTotal = groupTotals[gKey] || 1;
              const ratio = w != null ? w / gTotal : 0;
              const sw = sel ? Math.max(2.5, 1 + ratio * 32) : (w != null ? 1 + ratio * 32 : 1.5);
              const aw = w != null ? 5 + ratio * 32 : 8;
              const baseCol = isMitigate ? mitigateCol : wire;
              const col = sel ? '#6366F1' : baseCol;
              return (
                <g key={lk.id} opacity={vis ? 1 : 0.12}>
                  <path
                    d={path} fill="none"
                    stroke={col} strokeWidth={sw}
                    strokeDasharray={isMitigate ? '8 4' : undefined}
                  />
                  <polygon
                    points={arrowHead(x2, y2, endAngle, aw)}
                    fill={col}
                  />
                  {/* Wide invisible hit target */}
                  <path
                    d={path} fill="none" stroke="transparent" strokeWidth={14}
                    style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); select(lk.id, 'link'); }}
                  />
                  {lk.label && (
                    <text
                      x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}
                      textAnchor="middle" fontSize={11}
                      fill={isMitigate ? mitigateCol : sub}
                      style={{ pointerEvents: 'none' }}
                    >
                      {lk.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Nodes ── */}
            {nodes.map(node => {
              const vis = matches(node);
              const isSel = selId === node.id;
              const isSrc = linkSrc === node.id;
              const sc = SCOPE_COLORS[node.scope];
              const isSolution = (node.kind || 'issue') === 'solution';
              return (
                <g
                  key={node.id} opacity={vis ? 1 : 0.12}
                  style={{ cursor: mode === 'link' ? 'crosshair' : 'grab' }}
                  onMouseDown={e => onNodeDown(node.id, e)}
                >
                  {/* Shadow */}
                  <rect
                    x={node.x + 1} y={node.y + 2}
                    width={NODE_W} height={NODE_H} rx={NODE_R}
                    fill="rgba(0,0,0,0.07)"
                  />
                  {/* Card with left color bar (clipped to rounded rect) */}
                  <g clipPath={`url(#c${node.id})`}>
                    <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H}
                      fill={isSolution ? solBg : cardBg} />
                    <rect x={node.x} y={node.y} width={6} height={NODE_H} fill={sc} />
                  </g>
                  {/* Solution: dashed green border always visible */}
                  {isSolution && (
                    <rect
                      x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={NODE_R}
                      fill="none" stroke={solBorder} strokeWidth={2}
                      strokeDasharray="6 3"
                    />
                  )}
                  {/* Selection / link-source border */}
                  {(isSel || isSrc) && (
                    <rect
                      x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={NODE_R}
                      fill="none" stroke={isSolution ? solBorder : sc} strokeWidth={2.5}
                      strokeDasharray={isSrc ? '6 3' : undefined}
                    />
                  )}
                  {/* Solution badge: lightbulb icon in top-right */}
                  {isSolution && (
                    <g transform={`translate(${node.x + NODE_W - 22}, ${node.y + 6})`}>
                      <circle cx={7} cy={7} r={9} fill={solBorder} opacity={0.18} />
                      <svg x={1} y={1} width={12} height={12} viewBox="0 0 24 24"
                        fill="none" stroke={solBorder} strokeWidth={2.5}
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6" />
                        <path d="M10 22h4" />
                        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                      </svg>
                    </g>
                  )}
                  {/* Title */}
                  <text
                    x={node.x + 16} y={node.y + 26}
                    fontSize={13} fontWeight="600" fill={txt}
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.title.length > 22 ? node.title.slice(0, 20) + '…' : node.title}
                  </text>
                  {/* Subtitle */}
                  <text
                    x={node.x + 16} y={node.y + 44}
                    fontSize={10} fill={isSolution ? solBorder : sub}
                    style={{ pointerEvents: 'none' }}
                  >
                    {isSolution ? '💡 ' : ''}{SCOPE_LABELS[node.scope]} · {TIMEFRAME_LABELS[node.timeframe]}
                  </text>
                </g>
              );
            })}

            {/* Link-source pulsing ring */}
            {linkSrc && (() => {
              const s = nodes.find(n => n.id === linkSrc);
              if (!s) return null;
              return (
                <circle
                  cx={s.x + NODE_W / 2} cy={s.y + NODE_H / 2} r={60}
                  fill="none" stroke="#6366F1" strokeWidth={1.5}
                  strokeDasharray="4 4" opacity={0.4}
                  style={{ pointerEvents: 'none' }}
                >
                  <animate attributeName="r" values="55;65;55" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
              );
            })()}
          </g>

          {/* Empty-state hint */}
          {nodes.length === 0 && (
            <text
              x="50%" y="55%" textAnchor="middle" fontSize={16} fill={sub}
              style={{ pointerEvents: 'none' }}
            >
              Double-click anywhere to add your first issue
            </text>
          )}
        </svg>

        {/* ─── Link Edit Panel (side) ─── */}
        {selLink && (
          <Box
            position="absolute" top={0} right={0} w="300px" h="100%"
            bg={chrome} borderLeft="1px solid" borderColor={border}
            p={4} overflowY="auto" zIndex={10}
            style={{ boxShadow: '-4px 0 12px rgba(0,0,0,0.08)' }}
          >
            <Flex justify="space-between" align="center" mb={4}>
              <Heading size="sm">{isStaticMode ? 'Link' : 'Edit Link'}</Heading>
              <IconButton aria-label="Close" size="xs" variant="ghost" onClick={deselect}>
                <X size={14} />
              </IconButton>
            </Flex>
            <VStack gap={3} align="stretch">
              {isStaticMode ? (
                <>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Kind</Text>
                    <Text fontSize="sm">{(selLink.kind || 'causes') === 'mitigates' ? 'Mitigates' : 'Causes'}</Text>
                  </Box>
                  {selLink.label && (
                    <Box>
                      <Text fontSize="xs" fontWeight="bold" mb={1}>Label</Text>
                      <Text fontSize="sm">{selLink.label}</Text>
                    </Box>
                  )}
                  {selLink.weight != null && (
                    <Box>
                      <Text fontSize="xs" fontWeight="bold" mb={1}>Weight</Text>
                      <Text fontSize="sm">{selLink.weight}</Text>
                    </Box>
                  )}
                </>
              ) : (
                <>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Kind</Text>
                    <HStack gap={1}>
                      <Button size="xs"
                        variant={(selLink.kind || 'causes') === 'causes' ? 'solid' : 'outline'}
                        onClick={() => patchLink(selLink.id, { kind: 'causes' })}>
                        Causes
                      </Button>
                      <Button size="xs"
                        variant={(selLink.kind || 'causes') === 'mitigates' ? 'solid' : 'outline'}
                        onClick={() => patchLink(selLink.id, { kind: 'mitigates' })}
                        style={(selLink.kind || 'causes') === 'mitigates'
                          ? { backgroundColor: mitigateCol, color: '#fff' } : {}}>
                        Mitigates
                      </Button>
                    </HStack>
                  </Box>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Label</Text>
                    <Input
                      size="sm" value={selLink.label}
                      onChange={e => patchLink(selLink.id, { label: e.target.value })}
                      placeholder="Relationship…"
                    />
                  </Box>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Weight</Text>
                    <Input
                      size="sm" type="number" min={0} step={0.1}
                      value={selLink.weight ?? ''}
                      onChange={e => {
                        const v = e.target.value;
                        patchLink(selLink.id, { weight: v === '' ? undefined : Math.max(0, parseFloat(v) || 0) });
                      }}
                      placeholder="(none)"
                    />
                    {selLink.weight != null && selLink.label && (() => {
                      const key = `${selLink.to}::${selLink.label}`;
                      const total = groupTotals[key];
                      const count = links.filter(l => l.to === selLink.to && l.label === selLink.label && l.weight != null).length;
                      return total != null && count > 1
                        ? <Text fontSize="xs" color={sub} mt={1}>
                            Group total: {total} ({count} "{selLink.label}" links → same target)
                          </Text>
                        : null;
                    })()}
                  </Box>
                </>
              )}
              <Text fontSize="xs" color={sub}>
                {nodes.find(n => n.id === selLink.from)?.title ?? '?'} →{' '}
                {nodes.find(n => n.id === selLink.to)?.title ?? '?'}
              </Text>
              {!isStaticMode && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => rmLink(selLink.id)}
                  style={{ color: '#E53E3E', borderColor: '#E53E3E' }}
                >
                  <Trash2 size={14} /> Delete Link
                </Button>
              )}
            </VStack>
          </Box>
        )}

        {/* ─── Node List Panel (collapsible right) ─── */}
        <Box
          position="absolute" top={0} right={0} h="100%" zIndex={5}
          display="flex" flexDirection="row"
        >
          {/* Toggle tab */}
          <Flex
            align="center" justify="center" cursor="pointer"
            w="24px" bg={chrome} borderLeft="1px solid" borderColor={border}
            onClick={() => setListOpen(o => !o)}
            style={{ boxShadow: '-2px 0 6px rgba(0,0,0,0.05)' }}
          >
            {listOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </Flex>
          {/* Panel body */}
          {listOpen && (
            <Box
              w="260px" h="100%" bg={chrome}
              borderLeft="1px solid" borderColor={border}
              overflowY="auto" display="flex" flexDirection="column"
              style={{ boxShadow: '-4px 0 12px rgba(0,0,0,0.08)' }}
            >
              <Flex px={3} py={2} align="center" gap={2}
                borderBottom="1px solid" borderColor={border} flexShrink={0}>
                <List size={14} />
                <Text fontSize="sm" fontWeight="600" flex={1}>
                  Nodes ({nodes.length})
                </Text>
              </Flex>
              <Box flex={1} overflowY="auto">
                {[...nodes]
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map(node => {
                    const isSolution = (node.kind || 'issue') === 'solution';
                    const isSelected = selId === node.id;
                    return (
                      <Flex
                        key={node.id}
                        px={3} py={1.5} gap={2} align="center" cursor="pointer"
                        bg={isSelected ? 'blackAlpha.100' : undefined}
                        _hover={{ bg: 'blackAlpha.50' }}
                        onClick={() => focusNode(node)}
                        borderBottom="1px solid" borderColor={border}
                      >
                        <Box
                          w="8px" h="8px" borderRadius="full" flexShrink={0}
                          bg={SCOPE_COLORS[node.scope]}
                        />
                        {isSolution && <Lightbulb size={12} color={solBorder} style={{ flexShrink: 0 }} />}
                        <Text fontSize="xs" flex={1} lineClamp={1}>
                          {node.title}
                        </Text>
                        <Text fontSize="9px" color={sub} flexShrink={0}>
                          {TIMEFRAME_LABELS[node.timeframe]}
                        </Text>
                      </Flex>
                    );
                  })}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* ─── Node Detail Modal ─── */}
      {modalNode && (
        <Box
          position="fixed" inset={0} zIndex={100}
          display="flex" alignItems="center" justifyContent="center"
          onClick={() => { setModalNodeId(null); setMdEditing(false); }}
        >
          <Box position="absolute" inset={0} bg="blackAlpha.600" />
          <Box
            position="relative"
            bg={chrome} borderRadius="xl" w="100%" maxW="680px"
            maxH="85vh" overflow="hidden" display="flex" flexDirection="column"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <Flex
              px={6} py={4} gap={3} align="center"
              borderBottom="1px solid" borderColor={border} flexShrink={0}
            >
              <Box
                w="6px" h="36px" borderRadius="3px" flexShrink={0}
                bg={(modalNode.kind || 'issue') === 'solution' ? solBorder : SCOPE_COLORS[modalNode.scope]}
              />
              {(modalNode.kind || 'issue') === 'solution' && (
                <Flex
                  align="center" gap={1} px={2} py={0.5} borderRadius="md" flexShrink={0}
                  bg="rgba(56,161,105,0.12)" color={solBorder} fontSize="xs" fontWeight="bold"
                >
                  <Lightbulb size={12} /> Solution
                </Flex>
              )}
              {isStaticMode ? (
                <Text flex={1} fontSize="lg" fontWeight="600">{modalNode.title}</Text>
              ) : (
                <Input
                  flex={1} size="lg" variant="flushed" fontWeight="600"
                  value={modalNode.title}
                  onChange={e => patchNode(modalNode.id, { title: e.target.value })}
                />
              )}
              <IconButton
                aria-label="Close" size="sm" variant="ghost"
                onClick={() => { setModalNodeId(null); setMdEditing(false); }}
              >
                <X size={18} />
              </IconButton>
            </Flex>

            {/* Metadata bar */}
            <Flex px={6} py={2} gap={3} align="center" flexWrap="wrap"
              borderBottom="1px solid" borderColor={border} flexShrink={0}
            >
              {isStaticMode ? (
                <>
                  <Text fontSize="xs">
                    <Text as="span" fontWeight="bold">Kind: </Text>
                    {(modalNode.kind || 'issue') === 'solution' ? 'Solution' : 'Issue'}
                  </Text>
                  <Text fontSize="xs">
                    <Text as="span" fontWeight="bold">Scope: </Text>
                    <Box as="span" display="inline-block" w="8px" h="8px" borderRadius="full"
                      bg={SCOPE_COLORS[modalNode.scope]} mr={1} verticalAlign="middle" />
                    {SCOPE_LABELS[modalNode.scope]}
                  </Text>
                  <Text fontSize="xs">
                    <Text as="span" fontWeight="bold">Time: </Text>
                    {TIMEFRAME_LABELS[modalNode.timeframe]}
                  </Text>
                </>
              ) : (
                <>
                  <HStack gap={1}>
                    <Text fontSize="xs" fontWeight="bold">Kind:</Text>
                    <Button size="xs"
                      variant={(modalNode.kind || 'issue') === 'issue' ? 'solid' : 'outline'}
                      onClick={() => patchNode(modalNode.id, { kind: 'issue' })}>
                      Issue
                    </Button>
                    <Button size="xs"
                      variant={(modalNode.kind || 'issue') === 'solution' ? 'solid' : 'outline'}
                      onClick={() => patchNode(modalNode.id, { kind: 'solution' })}
                      style={(modalNode.kind || 'issue') === 'solution'
                        ? { backgroundColor: solBorder, color: '#fff' } : {}}>
                      <Lightbulb size={12} /> Solution
                    </Button>
                  </HStack>
                  <HStack gap={1}>
                    <Text fontSize="xs" fontWeight="bold">Scope:</Text>
                    {ALL_SCOPES.map(s => (
                      <Button
                        key={s} size="xs"
                        variant={modalNode.scope === s ? 'solid' : 'outline'}
                        onClick={() => patchNode(modalNode.id, { scope: s })}
                        style={modalNode.scope === s
                          ? { backgroundColor: SCOPE_COLORS[s], color: '#fff' }
                          : {}}
                      >
                        {SCOPE_LABELS[s]}
                      </Button>
                    ))}
                  </HStack>
                  <HStack gap={1}>
                    <Text fontSize="xs" fontWeight="bold">Time:</Text>
                    {ALL_TIMEFRAMES.map(t => (
                      <Button
                        key={t} size="xs"
                        variant={modalNode.timeframe === t ? 'solid' : 'outline'}
                        onClick={() => patchNode(modalNode.id, { timeframe: t })}
                      >
                        {TIMEFRAME_LABELS[t]}
                      </Button>
                    ))}
                  </HStack>
                </>
              )}
            </Flex>

            {/* Description body */}
            <Box flex={1} overflowY="auto" px={6} py={4}>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontSize="xs" fontWeight="bold" color={sub}>Description</Text>
                {!isStaticMode && (
                  <Button
                    size="xs" variant="ghost"
                    onClick={() => setMdEditing(!mdEditing)}
                  >
                    {mdEditing
                      ? <><Eye size={13} />&nbsp;Preview</>
                      : <><Pencil size={13} />&nbsp;Edit</>}
                  </Button>
                )}
              </Flex>

              {!isStaticMode && mdEditing ? (
                <Textarea
                  w="100%" minH="250px" fontFamily="mono" fontSize="sm"
                  value={modalNode.description}
                  onChange={e => patchNode(modalNode.id, { description: e.target.value })}
                  placeholder="Write markdown here…"
                />
              ) : (
                <Box minH="100px">
                  {modalNode.description
                    ? <RenderedMarkdown text={modalNode.description} />
                    : <Text color={sub} fontSize="sm" fontStyle="italic">No description yet.</Text>}
                </Box>
              )}

              {/* Connections */}
              {modalConnections.length > 0 && (
                <Box mt={4} pt={3} borderTop="1px solid" borderColor={border}>
                  <Text fontSize="xs" fontWeight="bold" color={sub} mb={2}>
                    {modalConnections.length} connection(s)
                  </Text>
                  <VStack gap={1} align="stretch">
                    {modalConnections.map(lk => {
                      const other = lk.from === modalNode.id
                        ? nodes.find(n => n.id === lk.to)
                        : nodes.find(n => n.id === lk.from);
                      if (!other) return null;
                      const direction = lk.from === modalNode.id ? '→' : '←';
                      return (
                        <Flex
                          key={lk.id} gap={2} align="center" fontSize="sm"
                          px={2} py={1} borderRadius="md"
                          _hover={{ bg: 'blackAlpha.50' }}
                          cursor="pointer"
                          onClick={() => {
                            setModalNodeId(other.id);
                            setMdEditing(false);
                            select(other.id, 'node');
                          }}
                        >
                          <Box
                            w="8px" h="8px" borderRadius="full" flexShrink={0}
                            bg={SCOPE_COLORS[other.scope]}
                          />
                          <Text flex={1}>
                            {direction} {other.title}
                          </Text>
                          {lk.label && (
                            <Text fontSize="xs" color={sub}>{lk.label}</Text>
                          )}
                        </Flex>
                      );
                    })}
                  </VStack>
                </Box>
              )}
            </Box>

            {/* Footer */}
            <Flex px={6} py={3} borderTop="1px solid" borderColor={border}
              justify={isStaticMode ? 'flex-end' : 'space-between'} align="center" flexShrink={0}
            >
              {!isStaticMode && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => { rmNode(modalNode.id); setModalNodeId(null); }}
                  style={{ color: '#E53E3E', borderColor: '#E53E3E' }}
                >
                  <Trash2 size={14} /> Delete {(modalNode.kind || 'issue') === 'solution' ? 'Solution' : 'Issue'}
                </Button>
              )}
              <Button
                size="sm" variant="solid"
                onClick={() => { setModalNodeId(null); setMdEditing(false); }}
              >
                {isStaticMode ? 'Close' : 'Done'}
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {/* ─── Import JSON Modal ─── */}
      {importOpen && (
        <Box
          position="fixed" inset={0} zIndex={100}
          display="flex" alignItems="center" justifyContent="center"
          onClick={() => setImportOpen(false)}
        >
          <Box position="absolute" inset={0} bg="blackAlpha.600" />
          <Box
            position="relative"
            bg={chrome} borderRadius="xl" w="100%" maxW="620px"
            maxH="80vh" overflow="hidden" display="flex" flexDirection="column"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <Flex
              px={6} py={4} gap={3} align="center"
              borderBottom="1px solid" borderColor={border} flexShrink={0}
            >
              <FileDown size={18} />
              <Heading size="sm" flex={1}>Import JSON — Merge into graph</Heading>
              <IconButton
                aria-label="Close" size="sm" variant="ghost"
                onClick={() => setImportOpen(false)}
              >
                <X size={18} />
              </IconButton>
            </Flex>

            <Box flex={1} overflowY="auto" px={6} py={4}>
              <Text fontSize="sm" color={sub} mb={3}>
                Paste a JSON object with <code>nodes</code> and/or <code>links</code> arrays.
                Nodes and links will be merged into the current graph. Conflicting IDs are
                automatically remapped.
              </Text>
              <Textarea
                w="100%" minH="280px" fontFamily="mono" fontSize="sm"
                value={importJson}
                onChange={e => { setImportJson(e.target.value); setImportErr(''); }}
                placeholder='{"nodes": [...], "links": [...]}'
              />
              {importErr && (
                <Text fontSize="sm" color="red.400" mt={2}>{importErr}</Text>
              )}
            </Box>

            <Flex px={6} py={3} borderTop="1px solid" borderColor={border}
              justify="flex-end" align="center" gap={3} flexShrink={0}
            >
              <Button size="sm" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm" variant="solid"
                disabled={!importJson.trim()}
                onClick={() => mergeJson(importJson)}
              >
                Merge into graph
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Flex>
  );
};

export default Brainstorm;
