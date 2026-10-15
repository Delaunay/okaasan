// Stroke-order drawing, independent of the script: strokes are polylines in a
// 100x100 box, checked one at a time for position, order and direction.
import React, { useRef, useState } from 'react';
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { RotateCcw } from 'lucide-react';

export type Pt = [number, number];
export type Stroke = Pt[];

export const ln = (...xy: number[]): Stroke => {
  const s: Stroke = [];
  for (let i = 0; i < xy.length; i += 2) s.push([xy[i], xy[i + 1]]);
  return s;
};

// Counter-clockwise circle from the top.
export const ring = (cx: number, cy: number, r: number): Stroke =>
  Array.from({ length: 33 }, (_, i) => {
    const a = -Math.PI / 2 - (i / 32) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

export const STROKE_KEYFRAMES = `
  @keyframes lt-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes lt-fade { from { opacity: 0; } to { opacity: 1; } }
`;
const STROKE_TOLERANCE = 16;  // mean distance, in 1/100 of the box

export const pathD = (s: Stroke) => s.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

export const pathLen = (s: Stroke) => s.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);

export function resample(s: Stroke, n: number): Stroke {
  const total = pathLen(s);
  if (s.length < 2 || total === 0) return Array.from({ length: n }, () => s[0]);
  const out: Stroke = [];
  let seg = 1;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (seg < s.length - 1 && acc + Math.hypot(s[seg][0] - s[seg - 1][0], s[seg][1] - s[seg - 1][1]) < target) {
      acc += Math.hypot(s[seg][0] - s[seg - 1][0], s[seg][1] - s[seg - 1][1]);
      seg++;
    }
    const [ax, ay] = s[seg - 1];
    const [bx, by] = s[seg];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const t = Math.min(1, Math.max(0, (target - acc) / len));
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

export function fits(user: Stroke, expected: Stroke) {
  const a = resample(user, 32);
  const b = resample(expected, 32);
  return a.reduce((sum, p, i) => sum + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length < STROKE_TOLERANCE;
}

export function GridBox({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block', touchAction: 'none' }}>
      <rect x={0.5} y={0.5} width={99} height={99} rx={3} fill="var(--input-bg)" stroke="var(--border-color)" strokeWidth={0.6} />
      <line x1={50} y1={2} x2={50} y2={98} stroke="var(--border-color)" strokeWidth={0.4} strokeDasharray="2 2" />
      <line x1={2} y1={50} x2={98} y2={50} stroke="var(--border-color)" strokeWidth={0.4} strokeDasharray="2 2" />
      {children}
    </svg>
  );
}

export function StartMarker({ s, n, color }: { s: Stroke; n: number; color: string }) {
  return (
    <g>
      <circle cx={s[0][0]} cy={s[0][1]} r={3.6} fill={color} />
      <text x={s[0][0]} y={s[0][1] + 1.3} fontSize={4.2} fontWeight={700} textAnchor="middle" fill="var(--card-bg)">{n}</text>
    </g>
  );
}

// Animated stroke order. Change `key` to replay.
export function StrokeAnim({ strokes, size = 160 }: { strokes: Stroke[]; size?: number }) {
  return (
    <GridBox size={size}>
      {strokes.map((s, i) => (
        <path key={`g${i}`} d={pathD(s)} fill="none" stroke="var(--border-color)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {strokes.map((s, i) => (
        <path
          key={i}
          d={pathD(s)}
          pathLength={1}
          fill="none"
          stroke="var(--heading-color)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1"
          strokeDashoffset={1}
          style={{ animation: `lt-draw 0.55s ease-in-out ${i * 0.7}s both` }}
        />
      ))}
      {strokes.map((s, i) => (
        <g key={`n${i}`} style={{ animation: `lt-fade 0.2s ${i * 0.7}s both` }}>
          <StartMarker s={s} n={i + 1} color="var(--panel-red-text)" />
        </g>
      ))}
    </GridBox>
  );
}

export function StrokePad({ variants, guided, onDone, size = 280 }: {
  variants: Stroke[][];  // accepted stroke orders, the first one is shown
  guided: boolean;
  onDone: (mistakes: number) => void;
  size?: number;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(variants[0]);
  const [done, setDone] = useState(0);
  const [live, setLive] = useState<Stroke | null>(null);
  const [misses, setMisses] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(guided);
  const padRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const finished = done >= strokes.length;

  const reset = () => {
    setStrokes(variants[0]);
    setDone(0);
    setMisses(0);
    setMsg(null);
  };

  const toLocal = (e: React.PointerEvent): Pt => {
    const r = padRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };

  const grade = (u: Stroke) => {
    const candidates = done === 0 ? variants : [strokes];
    const match = candidates.find((v) => fits(u, v[done]));
    if (match) {
      setStrokes(match);
      setDone(done + 1);
      setMisses(0);
      setMsg(null);
      if (done + 1 === match.length) onDone(mistakes);
      return;
    }
    setMistakes(mistakes + 1);
    setMisses(misses + 1);
    const expected = strokes[done];
    if (fits(u.slice().reverse(), expected)) setMsg('Right place, wrong direction. Strokes go left to right and top to bottom.');
    else if (candidates.some((v) => v.some((s, i) => i > done && fits(u, s)))) setMsg('Right stroke, wrong order.');
    else setMsg('Not quite, try again.');
  };

  const hint = showGuide || misses >= 2;

  return (
    <VStack gap={2}>
      <Box
        ref={padRef}
        style={{ touchAction: 'none', cursor: finished ? 'default' : 'crosshair' }}
        onPointerDown={(e) => {
          if (finished) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drawing.current = [toLocal(e)];
          setLive(drawing.current);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          drawing.current = [...drawing.current, toLocal(e)];
          setLive(drawing.current);
        }}
        onPointerUp={() => {
          const u = drawing.current;
          drawing.current = null;
          setLive(null);
          if (u && pathLen(u) > 4) grade(u);
        }}
      >
        <GridBox size={size}>
          {hint && strokes.slice(done).map((s, i) => (
            <path key={`h${i}`} d={pathD(s)} fill="none" stroke="var(--border-color)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"
              opacity={showGuide || i === 0 ? 1 : 0} />
          ))}
          {strokes.slice(0, done).map((s, i) => (
            <path key={`d${i}`} d={pathD(s)} fill="none" stroke="var(--heading-color)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {hint && !finished && <StartMarker s={strokes[done]} n={done + 1} color="var(--panel-red-text)" />}
          {live && (
            <path d={pathD(live)} fill="none" stroke="var(--panel-blue-text)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </GridBox>
      </Box>
      <HStack gap={2} minH="28px">
        <Text fontSize="sm" color={msg ? 'var(--panel-red-text)' : 'var(--muted-text)'}>
          {finished ? `Done, ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : msg || `Stroke ${done + 1} of ${strokes.length}`}
        </Text>
      </HStack>
      {!finished && (
        <HStack gap={2}>
          <Button size="xs" variant="outline" onClick={reset}><RotateCcw size={12} /> Restart</Button>
          {!showGuide && <Button size="xs" variant="outline" onClick={() => setShowGuide(true)}>Show outline</Button>}
        </HStack>
      )}
    </VStack>
  );
}

