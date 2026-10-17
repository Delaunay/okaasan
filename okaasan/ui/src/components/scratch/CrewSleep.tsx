import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Input, Button, Dialog, Portal, CloseButton } from '@chakra-ui/react';
import {
  Save, Trash2, FolderOpen, Plus, Moon, Sun, Coffee, Plane, BedDouble, AlarmClock, Clock,
  ChevronDown, ChevronRight, Glasses, Sparkles, MapPin, X, Download, Upload, Settings,
  PlaneTakeoff, PlaneLanding, ShieldCheck, ShieldAlert, Pencil, Armchair, Pill,
} from 'lucide-react';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';
import { useColorModeValue } from '../ui/color-mode';
import {
  Airport, Route, RestBreak, Flight, SleepEntry, Profile, Iv, Night, ParsedFlight, ParsedSleep, Ground,
  PlanItem, EventKind, PlanEvent, Trip,
  MIN, HOUR, DAY, SLEEP_KINDS, DEFAULT_NAP_OPTIONS, KNOWN_AIRPORTS, ALL_TZ, TRIP_BEFORE, TRIP_AFTER,
  uid, baseCodes, validTz, wallParts, wallToUtc, utcToWall, clock, dayLabel, addDays, hm, intersect, overlapAll,
  overlap, fmtH, fmtShift, parseDur, fmtDur, nightsIn, driftHours, eveningOf, tzOffsetMin, coreOf,
  newAirport, networkAirports, networkRoutes, mergeNetwork, normalizeProfile, routeFor, defaultBreaks,
  readProfiles, writeProfiles, readDraft, writeDraft,
  parseRotation, planFlight, planGrounds, restChecks, tripEvents, expectedSleep, exampleProfile,
} from './crewSleepLogic';


// ---------------------------------------------------------------------------
// Presentation of plan events
// ---------------------------------------------------------------------------

const EVENT_META: Record<EventKind, { label: string; icon: React.ReactNode }> = {
  sleep: { label: 'Sleep', icon: <BedDouble size={16} /> },
  anchor: { label: 'Anchor sleep', icon: <Moon size={16} /> },
  nap: { label: 'Nap', icon: <AlarmClock size={16} /> },
  inflight: { label: 'Bunk rest', icon: <Plane size={16} /> },
  strategic: { label: 'Strategic nap in the crew lounge', icon: <Armchair size={16} /> },
  light: { label: 'Get bright light, go outside', icon: <Sun size={16} /> },
  dim: { label: 'Dim lights, sunglasses outside', icon: <Glasses size={16} /> },
  caffeine: { label: 'No more caffeine', icon: <Coffee size={16} /> },
  melatonin: { label: 'Melatonin', icon: <Pill size={16} /> },
  wakeup: { label: 'Start getting ready', icon: <Clock size={16} /> },
  depart: { label: 'Departure', icon: <PlaneTakeoff size={16} /> },
  arrive: { label: 'Arrival', icon: <PlaneLanding size={16} /> },
  inbed: { label: 'In bed from', icon: <BedDouble size={16} /> },
  rest: { label: 'Rest', icon: <ShieldCheck size={16} /> },
};

const isSleepKind = (k: EventKind) => (SLEEP_KINDS as EventKind[]).includes(k);

function homePhase(p: Profile, homeTz: string, now: number) {
  const w = wallParts(now, homeTz);
  const mins = w.hour * 60 + w.minute;
  const bed = hm(p.bedtime);
  const wake = hm(p.wake);
  const inNight = bed > wake ? (mins >= bed || mins < wake) : (mins >= bed && mins < wake);
  const sinceWake = (mins - wake + 1440) % 1440;
  const toBed = (bed - mins + 1440) % 1440;
  if (inNight) return { icon: <Moon size={18} />, label: 'Home night', tip: 'Sleep if you can. If on duty, keep light low and wear sunglasses outside.' };
  if (toBed <= 120) return { icon: <Glasses size={18} />, label: 'Wind down', tip: 'Dim the lights, avoid screens, no caffeine. Home bedtime is close.' };
  if (sinceWake < 180) return { icon: <Sun size={18} />, label: 'Home morning', tip: 'Get bright light and eat breakfast: it anchors your clock on home time.' };
  if (toBed <= 360) return { icon: <Coffee size={18} />, label: 'Home evening', tip: 'Caffeine cutoff has passed. A short nap is fine; avoid long ones.' };
  return { icon: <Sparkles size={18} />, label: 'Home day', tip: 'Stay active and eat on home meal times when possible.' };
}

const inTime = (ms: number) => (ms < HOUR ? `${Math.max(1, Math.round(ms / MIN))} min` : fmtH(ms / HOUR));

// ---------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------

const Card: React.FC<{ title?: React.ReactNode; children: React.ReactNode; flex?: string }> = ({ title, children, flex }) => (
  <Box flex={flex} minW={0} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
    {title && <Heading size="sm" mb={3} color="var(--heading-color)">{title}</Heading>}
    {children}
  </Box>
);

const Labeled: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Text fontSize="xs" fontWeight="bold" mb={1}>{label}</Text>
    {children}
  </Box>
);

const StatTile: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <Box flex="1 1 150px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={3}>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
    <Text fontSize="xl" fontWeight="bold">{value}</Text>
    {sub && <Text fontSize="2xs" color="var(--muted-text)">{sub}</Text>}
  </Box>
);

const TzInput: React.FC<{ value: string; onChange: (v: string) => void; size?: 'xs' | 'sm' }> = ({ value, onChange, size = 'sm' }) => (
  <Input size={size} list="crew-sleep-tz" value={value} onChange={e => onChange(e.target.value)}
    borderColor={validTz(value) ? undefined : 'red.400'} placeholder="Asia/Seoul" />
);

/** Duration field accepting "90", "1h30", "1:30"; commits on blur / Enter. */
const DurInput: React.FC<{ value: number; onChange: (min: number) => void; w?: string; placeholder?: string; clearOnCommit?: boolean; size?: 'xs' | 'sm' }> = ({ value, onChange, w = '80px', placeholder, clearOnCommit, size = 'xs' }) => {
  const shown = clearOnCommit ? '' : fmtDur(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const m = parseDur(text);
    if (Number.isFinite(m) && m >= 0) onChange(m);
    setText(shown);
  };
  return (
    <Input size={size} w={w} value={text} placeholder={placeholder} onChange={e => setText(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
  );
};

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', fontSize: 11, color: 'var(--muted-text)', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '3px 6px', fontSize: 12, verticalAlign: 'middle' };

// ---------------------------------------------------------------------------
// Actogram: one row per evening, 12:00 -> 12:00 home time
// ---------------------------------------------------------------------------

interface ActoColors { sleep: string; anchor: string; anchorFill: string; homeNight: string; localNight: string; flight: string; grid: string; rowLine: string; text: string; now: string; warn: string }

const Actogram: React.FC<{
  homeTz: string;
  dates: string[];
  nights: Night[];
  cores: Iv[];
  commutes: (Iv & { label: string })[];
  localNights: (Iv & { place: string })[];
  grounds: Ground[];
  flights: ParsedFlight[];
  plans: PlanItem[];
  sleeps: ParsedSleep[];
  now: number;
  colors: ActoColors;
}> = ({ homeTz, dates, nights, cores, commutes, localNights, grounds, flights, plans, sleeps, now, colors }) => {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setBoxW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Phones: one label line per day above a full-width bar instead of a label column.
  const compact = boxW > 0 && boxW < 640;

  const rows = useMemo(() => dates.map(d => ({
    date: d,
    start: wallToUtc(`${d}T12:00`, homeTz),
    end: wallToUtc(`${addDays(d, 1)}T12:00`, homeTz),
  })), [dates, homeTz]);

  const describe = (iv: Iv, tz: string) =>
    `local ${clock(iv.start, tz)}–${clock(iv.end, tz)} · home ${clock(iv.start, homeTz)}–${clock(iv.end, homeTz)} · ${fmtH((iv.end - iv.start) / HOUR)}`;

  // Hover on a laptop, tap on a phone; tapping elsewhere closes it.
  const tipProps = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, text }),
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setHover({ x: e.clientX, y: e.clientY, text }); },
  });

  const inRow = <T extends Iv>(r: Iv, list: T[]) => list.filter(iv => iv.end > r.start && iv.start < r.end);
  const placesOf = (r: Iv) => inRow(r, grounds).filter(g => !g.isHome).map(g => g.code).join(' ');

  /** Everything drawn for one day, in a box of `rowH` at (x0, y) spanning `plotW`. */
  const layers = (r: Iv, y: number, x0: number, plotW: number, rowH: number) => {
    const span = r.end - r.start;
    const xOf = (t: number) => x0 + ((Math.min(Math.max(t, r.start), r.end) - r.start) / span) * plotW;
    const mid = y + rowH / 2;
    return (
      <>
        {inRow(r, nights).map(n => (
          <rect key={n.start} x={xOf(n.start)} y={y + 1} width={xOf(n.end) - xOf(n.start)} height={rowH - 2} fill={colors.homeNight} />
        ))}
        {inRow(r, localNights).map(n => (
          <rect key={`l${n.start}`} x={xOf(n.start)} y={y + 1} width={xOf(n.end) - xOf(n.start)} height={rowH - 2} fill={colors.localNight}
            {...tipProps(`Local night at ${n.place}`)} />
        ))}
        {inRow(r, commutes).map(c => (
          <line key={`c${c.start}`} x1={xOf(c.start)} x2={xOf(c.end)} y1={mid} y2={mid}
            stroke={colors.flight} strokeWidth={3} strokeDasharray="3 3"
            {...tipProps(`${c.label} · home ${clock(c.start, homeTz)}–${clock(c.end, homeTz)} · ${fmtDur((c.end - c.start) / MIN)}`)} />
        ))}
        {inRow(r, flights).map(f => (
          <rect key={`f${f.id}`} x={xOf(f.start)} y={mid - 3} width={Math.max(2, xOf(f.end) - xOf(f.start))} height={6} rx={3} fill={colors.flight}
            {...tipProps(`Flight ${f.label} ${f.from}→${f.to} · home ${clock(f.start, homeTz)}–${clock(f.end, homeTz)} · ${fmtH((f.end - f.start) / HOUR)}`)} />
        ))}
        {inRow(r, plans).flatMap(pl => {
          // Split each recommended sleep into its anchor-core part (green) and the rest (blue).
          const coreMin = overlapAll(pl, cores) / MIN;
          const tip = `Recommended · ${EVENT_META[pl.kind].label} · home ${clock(pl.start, homeTz)}–${clock(pl.end, homeTz)} · ${fmtDur((pl.end - pl.start) / MIN)}`
            + (coreMin ? ` · anchor core ${fmtDur(coreMin)}` : '');
          const cuts = cores.flatMap(c => [c.start, c.end]).filter(t => t > pl.start && t < pl.end).sort((a, b) => a - b);
          const edges = [pl.start, ...cuts, pl.end];
          return edges.slice(1).map((end, k) => {
            const piece = { start: edges[k], end };
            const isCore = cores.some(c => overlap(c, piece) > 0);
            return (
              <rect key={`p${pl.start}-${k}`} x={xOf(piece.start) + 1} y={y + 7} width={Math.max(2, xOf(piece.end) - xOf(piece.start) - 2)} height={rowH - 14} rx={4}
                fill={isCore ? colors.anchorFill : 'none'} stroke={isCore ? colors.anchor : colors.sleep} strokeWidth={isCore ? 2 : 1.5} strokeDasharray="4 3"
                {...tipProps(tip)} />
            );
          });
        })}
        {inRow(r, sleeps).map(s => (
          <rect key={`s${s.id}`} x={xOf(s.start)} y={y + 9} width={Math.max(2, xOf(s.end) - xOf(s.start))} height={rowH - 18} rx={4}
            fill={colors.sleep}
            {...tipProps(`Slept · ${describe(s, s.tz)} · ${Math.round(s.homeOverlap * 100)}% in home night`)} />
        ))}
        {now >= r.start && now < r.end && (
          <line x1={xOf(now)} x2={xOf(now)} y1={y} y2={y + rowH} stroke={colors.now} strokeWidth={2} />
        )}
      </>
    );
  };

  const hourLabel = (h: number) => `${String((h + 12) % 24).padStart(2, '0')}:00`;

  let chart: React.ReactNode;
  if (compact) {
    const ROWC = 26;
    chart = (
      <VStack align="stretch" gap={1.5}>
        <Box position="relative" h="14px">
          {[0, 6, 12, 18, 24].map(h => (
            <Text key={h} position="absolute" left={`${(h / 24) * 100}%`} fontSize="2xs" color="var(--muted-text)" lineHeight="14px"
              transform={h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)'}>{hourLabel(h)}</Text>
          ))}
        </Box>
        {rows.map(r => {
          const places = placesOf(r);
          const today = now >= r.start && now < r.end;
          return (
            <Box key={r.date}>
              <Flex justify="space-between" fontSize="xs" lineHeight="1.2" mb="1px">
                <Text fontWeight="bold" color={today ? colors.now : 'var(--heading-color)'}>{dayLabel(r.start, homeTz)}</Text>
                {places && <Text fontWeight="bold" color="var(--muted-text)">{places}</Text>}
              </Flex>
              <svg width="100%" height={ROWC} viewBox={`0 0 ${boxW} ${ROWC}`} style={{ display: 'block' }}>
                <rect x={0} y={0} width={boxW} height={ROWC} fill="none" stroke={colors.rowLine} strokeWidth={1} rx={3} />
                {[6, 12, 18].map(h => (
                  <line key={h} x1={(h / 24) * boxW} x2={(h / 24) * boxW} y1={0} y2={ROWC} stroke={colors.grid} strokeWidth={1} />
                ))}
                {layers(r, 0, 0, boxW, ROWC)}
              </svg>
            </Box>
          );
        })}
      </VStack>
    );
  } else {
    const W = 1000, LABEL = 120, ROW = 28, TOP = 22;
    const plotW = W - LABEL - 8;
    const H = TOP + dates.length * ROW + 4;
    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => {
          const x = LABEL + (h / 24) * plotW;
          return (
            <g key={h}>
              <line x1={x} x2={x} y1={TOP - 4} y2={H - 4} stroke={colors.grid} strokeWidth={1} />
              <text x={x} y={12} fontSize={10} textAnchor="middle" fill={colors.text}>{hourLabel(h)}</text>
            </g>
          );
        })}
        {rows.map((r, ri) => {
          const y = TOP + ri * ROW;
          const places = placesOf(r);
          return (
            <g key={r.date}>
              <line x1={LABEL} x2={W - 8} y1={y + ROW} y2={y + ROW} stroke={colors.rowLine} strokeWidth={1.5} />
              <text x={4} y={y + 17} fontSize={10.5} fill={colors.text}>{dayLabel(r.start, homeTz)}</text>
              {places && <text x={LABEL - 6} y={y + 17} fontSize={9.5} textAnchor="end" fill={colors.text} fontWeight={600}>{places}</text>}
              {layers(r, y, LABEL, plotW, ROW)}
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <Box ref={boxRef} position="relative" onClick={() => setHover(null)}>
      {chart}
      {hover && (
        <Box position="fixed" left={`${Math.max(8, Math.min(hover.x + 12, window.innerWidth - 328))}px`} top={`${hover.y + 12}px`} zIndex={20} pointerEvents="none"
          bg="var(--card-bg-raised)" border="1px solid" borderColor="var(--border-color)" borderRadius="md" px={2} py={1} fontSize="xs" boxShadow="md" maxW="320px">
          {hover.text}
        </Box>
      )}
    </Box>
  );
};

const ActoLegend: React.FC<{ colors: ActoColors }> = ({ colors }) => (
  <HStack gap={4} mb={2} flexWrap="wrap" fontSize="xs" color="var(--muted-text)">
    <HStack gap={1}><Box w="14px" h="8px" borderRadius="2px" border="1.5px dashed" borderColor={colors.sleep} /> <span>Recommended sleep</span></HStack>
    <HStack gap={1}><Box w="14px" h="8px" borderRadius="2px" border="1.5px dashed" borderColor={colors.anchor} /> <span>Anchor (core) sleep</span></HStack>
    <HStack gap={1}><Box w="14px" h="8px" borderRadius="2px" bg={colors.sleep} /> <span>Slept</span></HStack>
    <HStack gap={1}><Box w="14px" h="10px" bg={colors.homeNight} /> <span>Usual home night</span></HStack>
    <HStack gap={1}><Box w="14px" h="10px" bg={colors.localNight} /> <span>Local night (layover)</span></HStack>
    <HStack gap={1}><Box w="14px" h="6px" borderRadius="3px" bg={colors.flight} /> <span>Flight</span></HStack>
    <HStack gap={1}><Box w="14px" h="0" borderTop="3px dashed" borderColor={colors.flight} /> <span>Commute & preparation</span></HStack>
    <HStack gap={1}><Box w="2px" h="10px" bg={colors.now} /> <span>Now</span></HStack>
  </HStack>
);

// ---------------------------------------------------------------------------
// Add a trip: destination first, everything else prefilled
// ---------------------------------------------------------------------------

// Sectors shorter than this default to a turnaround about an hour after arrival.
const TURN_SECTOR_MIN = 4 * 60;

interface TripDraft {
  dest: string;
  base: string;
  date: string;
  time: string;
  flightNo: string;
  blockMin: number;
  retDate: string;
  retTime: string;
  retFlightNo: string;
  retBlockMin: number;
}

function draftFor(p: Profile, dest: string, date: string, tzOf: (c: string) => string): TripDraft {
  const bases = baseCodes(p.homeBase);
  const base = bases.find(b => routeFor(p.routes, b, dest).blockMin) ?? bases[0] ?? 'ICN';
  const out = routeFor(p.routes, base, dest);
  const back = routeFor(p.routes, dest, base);
  const time = out.route?.departTime || '10:00';
  const blockMin = out.blockMin ?? 0;
  const arrive = wallToUtc(`${date}T${time}`, tzOf(base)) + blockMin * MIN;
  let ret: string;
  if (blockMin && blockMin < TURN_SECTOR_MIN) {
    ret = utcToWall(arrive + 60 * MIN, tzOf(dest));
  } else {
    const arrLocal = Number.isFinite(arrive) ? utcToWall(arrive, tzOf(dest)).slice(0, 10) : date;
    ret = `${addDays(arrLocal, blockMin >= 8 * 60 ? 2 : 1)}T${back.route?.departTime || '10:00'}`;
  }
  return {
    dest, base, date, time,
    flightNo: out.route?.flightNo || '',
    blockMin,
    retDate: ret.slice(0, 10),
    retTime: ret.slice(11, 16),
    retFlightNo: back.route?.flightNo || '',
    retBlockMin: back.blockMin ?? blockMin,
  };
}

const AddTrip: React.FC<{
  p: Profile;
  homeTz: string;
  tzOf: (c: string) => string;
  cityOf: (c: string) => string;
  onAdd: (flights: Flight[], learned: Route[]) => void;
  onCancel: () => void;
}> = ({ p, homeTz, tzOf, cityOf, onAdd, onCancel }) => {
  const today = utcToWall(Date.now(), homeTz).slice(0, 10);
  const [destText, setDestText] = useState('');
  const [d, setD] = useState<TripDraft | null>(null);
  const bases = baseCodes(p.homeBase);
  const known = new Set(p.airports.map(a => a.code.toUpperCase()));

  const pickDest = (text: string) => {
    setDestText(text);
    const code = text.trim().toUpperCase().slice(0, 3);
    if (code.length === 3 && known.has(code) && !bases.includes(code)) setD(draftFor(p, code, d?.date || today, tzOf));
    else setD(null);
  };
  const patch = (x: Partial<TripDraft>) => setD(prev => (prev ? { ...prev, ...x } : prev));

  const leg = (date: string, time: string, from: string, blockMin: number) => {
    const start = wallToUtc(`${date}T${time}`, tzOf(from));
    return Number.isFinite(start) ? { start, end: start + blockMin * MIN } : null;
  };
  const out = d ? leg(d.date, d.time, d.base, d.blockMin) : null;
  const back = d ? leg(d.retDate, d.retTime, d.dest, d.retBlockMin) : null;
  const valid = !!(d && out && back && d.blockMin > 0 && d.retBlockMin > 0 && back.start > out.end);

  const submit = () => {
    if (!d || !out || !back || !valid) return;
    onAdd([
      { id: uid(), label: d.flightNo, from: d.base, to: d.dest, depart: `${d.date}T${d.time}`, arrive: utcToWall(out.end, tzOf(d.dest)), breaks: defaultBreaks(d.blockMin, p) },
      { id: uid(), label: d.retFlightNo, from: d.dest, to: d.base, depart: `${d.retDate}T${d.retTime}`, arrive: utcToWall(back.end, tzOf(d.base)), breaks: defaultBreaks(d.retBlockMin, p) },
    ], [
      { from: d.base, to: d.dest, blockMin: d.blockMin, departTime: d.time, flightNo: d.flightNo || undefined },
      { from: d.dest, to: d.base, blockMin: d.retBlockMin, departTime: d.retTime, flightNo: d.retFlightNo || undefined },
    ]);
  };

  const legs = d ? [
    { title: 'Outbound', from: d.base, to: d.dest, iv: out, date: null, time: 'time', no: 'flightNo', block: 'blockMin' },
    { title: 'Return', from: d.dest, to: d.base, iv: back, date: 'retDate', time: 'retTime', no: 'retFlightNo', block: 'retBlockMin' },
  ] as const : [];

  return (
    <Card title={<HStack gap={2}><PlaneTakeoff size={16} /><span>New trip</span></HStack>}>
      <Flex gap={3} flexWrap="wrap" align="flex-end">
        <Box flex="1 1 220px">
          <Labeled label="Where are you flying?">
            <Input size="md" list="crew-sleep-dest" placeholder="SYD, Paris, Tokyo…" value={destText} autoFocus
              onChange={e => pickDest(e.target.value)} />
          </Labeled>
        </Box>
        <Box>
          <Labeled label="Departure date">
            <Input size="md" type="date" value={d?.date || today} disabled={!d}
              onChange={e => { if (d) setD(draftFor(p, d.dest, e.target.value, tzOf)); }} />
          </Labeled>
        </Box>
      </Flex>
      <datalist id="crew-sleep-dest">
        {p.airports.filter(a => !bases.includes(a.code)).map(a => <option key={a.code} value={`${a.code} ${a.city || ''}`.trim()} />)}
      </datalist>

      {d && (
        <VStack align="stretch" gap={3} mt={4}>
          {legs.map(l => (
            <Box key={l.title} border="1px solid" borderColor="var(--border-color)" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={2}>
                {l.title}: {l.from} → {l.to} <Text as="span" fontWeight="normal" color="var(--muted-text)">{cityOf(l.to)}</Text>
              </Text>
              <Flex gap={2} flexWrap="wrap" align="flex-end">
                {l.date && (
                  <Labeled label={`Date (${l.from} local)`}>
                    <Input size="sm" type="date" value={d[l.date]} onChange={e => patch({ [l.date as string]: e.target.value })} />
                  </Labeled>
                )}
                <Labeled label={`Departs (${l.from} local)`}>
                  <Input size="sm" type="time" value={d[l.time]} onChange={e => patch({ [l.time]: e.target.value })} />
                </Labeled>
                <Labeled label="Block time">
                  <DurInput size="sm" w="90px" value={d[l.block]} onChange={m => patch({ [l.block]: m })} />
                </Labeled>
                <Labeled label="Flight no. (optional)">
                  <Input size="sm" w="100px" value={d[l.no]} onChange={e => patch({ [l.no]: e.target.value.toUpperCase() })} />
                </Labeled>
              </Flex>
              {l.iv && d[l.block] > 0 ? (
                <Text fontSize="xs" color="var(--muted-text)" mt={2}>
                  Arrives {dayLabel(l.iv.end, tzOf(l.to))} {clock(l.iv.end, tzOf(l.to))} local · home {clock(l.iv.start, homeTz)} → {clock(l.iv.end, homeTz)}
                </Text>
              ) : (
                <Text fontSize="xs" color="var(--panel-red-text, #ef4444)" mt={2}>No block time known for this route: enter one.</Text>
              )}
            </Box>
          ))}
          {out && back && back.start <= out.end && (
            <Text fontSize="xs" color="var(--panel-red-text, #ef4444)">The return must leave after the outbound arrives.</Text>
          )}
          <Text fontSize="2xs" color="var(--muted-text)">
            Departure times and flight numbers are remembered for the next trip on this route. Long flights get two default
            bunk breaks; adjust them with "Edit flights".
          </Text>
          <HStack>
            <Button colorPalette="blue" onClick={submit} disabled={!valid}><Plus size={14} /> Plan this trip</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </HStack>
        </VStack>
      )}
      {!d && <HStack mt={3}><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></HStack>}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** `basePath` is where the page is mounted: '/scratch/crew-sleep' in the site, '' in the standalone app. */
const CrewSleep: React.FC<{ basePath?: string }> = ({ basePath = '/scratch/crew-sleep' }) => {
  const { profile: urlProfile } = useParams<{ profile?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const rootPath = basePath || '/';
  const profilePath = (n: string) => `${basePath}/${encodeURIComponent(n)}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const days = Number(searchParams.get('days')) || 14;
  const configOpen = searchParams.get('config') === '1';
  const adding = searchParams.get('add') === '1';
  const showTips = searchParams.get('tips') !== '0';
  const editTrip = searchParams.get('edit') === '1';
  const showPast = searchParams.get('past') === '1';
  const showLog = searchParams.get('log') === '1';
  const tab = searchParams.get('tab') === 'history' ? 'history' : 'plan';

  const [p, setP] = useState<Profile>(() => normalizeProfile(urlProfile ? readProfiles()[urlProfile] ?? {} : readDraft() ?? {}));
  const [name, setName] = useState(urlProfile || '');
  const [savedNames, setSavedNames] = useState<string[]>(() => Object.keys(readProfiles()).sort());
  const [status, setStatus] = useState<'idle' | 'saved' | 'missing' | 'error'>('idle');
  const [netFilter, setNetFilter] = useState('');
  const [newRoute, setNewRoute] = useState<Route>({ from: '', to: '', blockMin: 0 });
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const colors: ActoColors = {
    sleep: useColorModeValue('#2a78d6', '#3987e5'),
    anchor: useColorModeValue('#1baf7a', '#199e70'),
    anchorFill: useColorModeValue('rgba(27, 175, 122, 0.12)', 'rgba(25, 158, 112, 0.2)'),
    homeNight: useColorModeValue('rgba(74, 58, 167, 0.12)', 'rgba(144, 133, 233, 0.16)'),
    localNight: useColorModeValue('rgba(235, 104, 52, 0.16)', 'rgba(217, 89, 38, 0.22)'),
    flight: useColorModeValue('#8a8984', '#8f8e88'),
    grid: useColorModeValue('#e2e8f0', '#2d3748'),
    rowLine: useColorModeValue('#a0aec0', '#4a5568'),
    text: useColorModeValue('#52514e', '#c3c2b7'),
    now: useColorModeValue('#e34948', '#e66767'),
    warn: useColorModeValue('#c2410c', '#fb923c'),
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const update = useCallback((fn: (prev: Profile) => Profile) => {
    dirty.current = true;
    setP(fn);
  }, []);
  const set = useCallback(<K extends keyof Profile>(key: K, val: Profile[K]) => update(prev => ({ ...prev, [key]: val })), [update]);

  // ---- persistence: this browser, with download / import for safekeeping --

  const refreshNames = () => setSavedNames(Object.keys(readProfiles()).sort());

  const loadedFor = useRef(urlProfile);
  useEffect(() => {
    if (loadedFor.current === urlProfile) return;
    loadedFor.current = urlProfile;
    dirty.current = false;
    if (urlProfile) {
      const data = readProfiles()[urlProfile];
      setP(normalizeProfile(data ?? {}));
      setStatus(data ? 'idle' : 'missing');
    } else {
      setP(normalizeProfile(readDraft() ?? {}));
      setStatus('idle');
    }
    setName(urlProfile || '');
  }, [urlProfile]);

  // A tracker should not lose entries: every change is saved to this browser right away.
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => {
      let ok: boolean;
      if (urlProfile) {
        const store = readProfiles();
        store[urlProfile] = p;
        ok = writeProfiles(store);
      } else {
        ok = writeDraft(p);
      }
      dirty.current = false;
      setStatus(ok ? 'saved' : 'error');
    }, 400);
    return () => clearTimeout(id);
  }, [p, urlProfile]);

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    const store = readProfiles();
    if (n !== urlProfile && store[n] && !window.confirm(`Replace the saved profile "${n}"?`)) return;
    store[n] = p;
    if (!writeProfiles(store)) { setStatus('error'); return; }
    dirty.current = false;
    loadedFor.current = n;
    setStatus('saved');
    refreshNames();
    navigate(`${profilePath(n)}${location.search}`, { replace: true });
  };

  const handleDelete = () => {
    const n = urlProfile;
    if (!n || !window.confirm(`Delete "${n}" from this browser? Download it first if you want to keep a copy.`)) return;
    const store = readProfiles();
    delete store[n];
    writeProfiles(store);
    refreshNames();
    navigate(`${rootPath}${location.search}`, { replace: true });
  };

  const homeTz = validTz(p.homeTz) ? p.homeTz : 'UTC';

  const handleDownload = () => {
    const label = (urlProfile || name.trim() || 'draft').replace(/[^\w-]+/g, '_');
    const payload = { app: 'crew-sleep', version: 1, name: urlProfile || name.trim() || null, savedAt: new Date().toISOString(), profile: p };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `crew-sleep-${label}-${utcToWall(Date.now(), homeTz).slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const profile = data && data.app === 'crew-sleep' ? data.profile : data;
      if (!profile || typeof profile !== 'object' || !('sleeps' in profile || 'flights' in profile)) throw new Error('not a crew-sleep file');
      if (!window.confirm(`Replace ${urlProfile ? `"${urlProfile}"` : 'the current profile'} with ${file.name}?`)) return;
      update(() => normalizeProfile(profile));
      if (!urlProfile && data.name) setName(data.name);
    } catch {
      window.alert(`${file.name} is not a Crew Sleep file.`);
    }
  };

  // ---- derived -----------------------------------------------------------

  const options = useMemo(() => Array.from(new Set(p.napOptionsMin.filter(m => m > 0))).sort((a, b) => a - b), [p.napOptionsMin]);
  const rotation = useMemo(() => parseRotation(p, homeTz), [p, homeTz]);
  const { flights, grounds, trips, gaps, tzOf, apOf } = rotation;
  const cityOf = useCallback((code: string) => apOf(code)?.city || '', [apOf]);

  const flightPlans = useMemo(() => flights.map(f => planFlight(f, p, homeTz, options)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flights, homeTz, options, p.bedtime, p.wake, p.bunkSettleMin, p.maxBunkRestMin, p.serviceAfterTakeoffMin, p.serviceBeforeLandingMin]);
  const inflight = useMemo(() => flightPlans.flatMap(fp => (fp.item ? [fp.item] : [])), [flightPlans]);
  const groundPlans = useMemo(() => planGrounds(grounds, p, homeTz, options, inflight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grounds, inflight, homeTz, options, p.bedtime, p.wake, p.targetHours, p.sleepBankMin, p.strategicNap, p.strategicNapMin, p.reportMin, p.melatonin, p.melatoninLeadMin]);
  const rests = useMemo(() => restChecks(grounds, p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grounds, p.reportMin, p.debriefMin, p.restHomeMin, p.restAwayMin, p.restAtLeastDuty]);
  const planSleeps = useMemo(() => [
    ...inflight,
    ...groundPlans.flatMap(gp => gp.items.filter(i => SLEEP_KINDS.includes(i.kind))),
  ].sort((a, b) => a.start - b.start), [inflight, groundPlans]);

  /** Where you are at `t`: away on a layover, in a flight, or home. */
  const whereAt = useCallback((t: number) => {
    const f = flights.find(x => t >= x.start && t < x.end);
    if (f) return { tz: homeTz, label: `in flight ${f.from}→${f.to}`, away: true };
    const g = grounds.find(x => !x.isHome && t >= x.start && t < x.end);
    if (g) return { tz: g.tz, label: cityOf(g.code) || g.code, away: true };
    return { tz: homeTz, label: 'home', away: false };
  }, [grounds, flights, homeTz, cityOf]);

  const sleeps: ParsedSleep[] = useMemo(() => {
    const parsed = p.sleeps
      .map(s => {
        const tz = validTz(s.tz) ? s.tz : homeTz;
        return { ...s, tz, start: wallToUtc(s.start, tz), end: wallToUtc(s.end, tz) };
      })
      .filter(s => s.end > s.start);
    if (!parsed.length) return [];
    const from = Math.min(...parsed.map(s => s.start));
    const to = Math.max(...parsed.map(s => s.end));
    const nights = nightsIn(homeTz, p.bedtime, p.wake, from, to);
    return parsed.map(s => {
      const dur = s.end - s.start;
      return { ...s, hours: dur / HOUR, homeOverlap: overlapAll(s, nights) / dur, drift: driftHours(s, homeTz, p.bedtime, p.wake) };
    }).sort((a, b) => b.start - a.start);
  }, [p.sleeps, homeTz, p.bedtime, p.wake]);

  // ---- selected trip: the one in the URL, else the current or next one ----

  const defaultTrip = useMemo(() => (
    trips.find(t => now >= t.start - TRIP_BEFORE && now <= t.end + TRIP_AFTER)
    ?? trips.find(t => t.start > now)
    ?? trips[trips.length - 1]
  ), [trips, now]);
  const trip: Trip | undefined = trips.find(t => t.id === searchParams.get('trip')) ?? defaultTrip;

  const events = useMemo(() => (trip ? tripEvents(trip, groundPlans, flightPlans, rests, homeTz, cityOf) : []),
    [trip, groundPlans, flightPlans, rests, homeTz, cityOf]);
  const impact = useMemo(() => (trip ? expectedSleep(trip, planSleeps, homeTz, p.targetHours) : []),
    [trip, planSleeps, homeTz, p.targetHours]);

  const tripDates = useMemo(() => {
    if (!trip) return [];
    const out: string[] = [];
    const last = eveningOf(trip.end + TRIP_AFTER - 12 * HOUR, homeTz);
    for (let d = eveningOf(trip.start - TRIP_BEFORE + 12 * HOUR, homeTz); d <= last && out.length < 30; d = addDays(d, 1)) out.push(d);
    return out;
  }, [trip, homeTz]);

  // ---- history range -----------------------------------------------------

  const range = useMemo(() => {
    const last = flights.length ? flights[flights.length - 1].end : now;
    return { start: now - days * DAY, end: Math.min(Math.max(now, last) + DAY, now + 21 * DAY) };
  }, [flights, now, days]);

  const dates = useMemo(() => {
    const out: string[] = [];
    const last = eveningOf(range.end, homeTz);
    for (let d = eveningOf(range.start, homeTz); d <= last && out.length < 120; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range, homeTz]);

  const allNights = useMemo(() => {
    const from = Math.min(range.start, trip ? trip.start - TRIP_BEFORE : range.start) - DAY;
    const to = Math.max(range.end, trip ? trip.end + TRIP_AFTER : range.end) + DAY;
    return nightsIn(homeTz, p.bedtime, p.wake, from, to);
  }, [homeTz, p.bedtime, p.wake, range, trip]);

  // Time reserved between bed and the aircraft: getting ready, commute, report (and lounge nap) before
  // a departure; deplaning, commute, shower after an arrival.
  const commutes = useMemo(() => groundPlans.flatMap(gp => {
    const g = gp.ground;
    if (!gp.window) return [];
    const out: (Iv & { label: string })[] = [];
    if (g.inbound) out.push({ start: g.inbound.end, end: gp.window.start, label: `Arrival ${g.code}: deplane, commute, shower` });
    if (g.outbound) out.push({ start: gp.window.end, end: g.outbound.start, label: `Before departure from ${g.outbound.from}: get ready, commute, report` });
    return out;
  }), [groundPlans]);

  const cores = useMemo(() => allNights.map(n => coreOf(n, p.anchorCoreMin)), [allNights, p.anchorCoreMin]);

  const localNights = useMemo(() => grounds.filter(g => !g.isHome).flatMap(g =>
    nightsIn(g.tz, p.bedtime, p.wake, g.start, g.end)
      .map(n => intersect(n, g))
      .filter((n): n is Iv => !!n)
      .map(n => ({ ...n, place: g.code }))), [grounds, p.bedtime, p.wake]);

  const stats = useMemo(() => {
    const week = { start: now - 7 * DAY, end: now };
    const weekHours = overlapAll(week, sleeps) / HOUR;
    const inRange = sleeps.filter(s => s.end > range.start && s.start < now);
    const total = inRange.reduce((acc, s) => acc + s.hours, 0);
    const aligned = inRange.reduce((acc, s) => acc + s.hours * s.homeOverlap, 0);
    const main = inRange.filter(s => s.hours >= 3);
    const drift = main.length ? main.reduce((acc, s) => acc + Math.abs(s.drift), 0) / main.length : 0;
    return { avg: weekHours / 7, debt: Math.max(0, p.targetHours * 7 - weekHours), alignment: total ? aligned / total : 0, drift, count: inRange.length };
  }, [sleeps, now, range, p.targetHours]);

  const dailySpec = useMemo(() => {
    const byDate = new Map<string, number>(dates.map(d => [d, 0]));
    for (const s of sleeps) {
      const d = eveningOf((s.start + s.end) / 2, homeTz);
      if (byDate.has(d)) byDate.set(d, (byDate.get(d) || 0) + s.hours);
    }
    const values = Array.from(byDate.entries())
      .filter(([d]) => wallToUtc(`${d}T12:00`, homeTz) <= now)
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 180,
      title: { text: 'Sleep per day (by evening, home time)', anchor: 'middle' as const, offset: 12 },
      layer: [
        {
          data: { values },
          mark: { type: 'bar', color: colors.sleep, cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4 },
          encoding: {
            x: { field: 'date', type: 'ordinal', title: null, axis: { labelAngle: -45 } },
            y: { field: 'hours', type: 'quantitative', title: 'Hours', axis: { titlePadding: 12 } },
            tooltip: [
              { field: 'date', type: 'nominal', title: 'Evening of' },
              { field: 'hours', type: 'quantitative', title: 'Hours', format: '.1f' },
            ],
          },
        },
        {
          data: { values: [{ target: p.targetHours }] },
          mark: { type: 'rule', strokeDash: [4, 3], color: colors.text },
          encoding: { y: { field: 'target', type: 'quantitative' } },
        },
      ],
    };
  }, [dates, sleeps, homeTz, now, p.targetHours, colors.sleep, colors.text]);

  const driftSpec = useMemo(() => {
    const values = sleeps
      .filter(s => s.hours >= 3 && s.end > range.start && s.start < now)
      .map(s => ({ date: eveningOf((s.start + s.end) / 2, homeTz), drift: Math.round(s.drift * 100) / 100, where: s.tz }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 180,
      title: { text: 'Main sleep drift vs home night', anchor: 'middle' as const, offset: 12 },
      layer: [
        {
          data: { values: [{ lo: -1, hi: 1 }] },
          mark: { type: 'rect', color: colors.sleep, opacity: 0.1 },
          encoding: { y: { field: 'lo', type: 'quantitative' }, y2: { field: 'hi' } },
        },
        {
          data: { values },
          mark: { type: 'line', point: { size: 64, filled: true }, strokeWidth: 2, color: colors.sleep },
          encoding: {
            x: { field: 'date', type: 'ordinal', title: null, axis: { labelAngle: -45 } },
            y: { field: 'drift', type: 'quantitative', title: 'Hours (+ later / − earlier)', scale: { domain: [-12, 12] }, axis: { titlePadding: 12, values: [-12, -6, 0, 6, 12] } },
            tooltip: [
              { field: 'date', type: 'nominal', title: 'Evening of' },
              { field: 'drift', type: 'quantitative', title: 'Drift (h)', format: '+.1f' },
              { field: 'where', type: 'nominal', title: 'Slept in' },
            ],
          },
        },
      ],
    };
  }, [sleeps, range, now, homeTz, colors.sleep]);

  // ---- now ---------------------------------------------------------------

  const here = whereAt(now);
  const phase = homePhase(p, homeTz, now);
  const nextEvent = events.find(e => e.start > now && !e.tip);
  const currentEvent = events.find(e => isSleepKind(e.kind) && e.start <= now && e.end > now);

  // ---- editing -----------------------------------------------------------

  const ensureAirport = (code: string) => update(prev => (
    !code || prev.airports.some(a => a.code.toUpperCase() === code.toUpperCase())
      ? prev
      : { ...prev, airports: [...prev.airports, newAirport(code.toUpperCase(), homeTz)] }
  ));
  const editAirport = (code: string, patch: Partial<Airport>) =>
    update(prev => ({ ...prev, airports: prev.airports.map(a => (a.code === code ? { ...a, ...patch } : a)) }));
  const removeAirport = (code: string) => update(prev => ({ ...prev, airports: prev.airports.filter(a => a.code !== code) }));

  /** Fill the arrival from the route's estimated block time, when the route is known. */
  const withEstimate = (prev: Profile, f: Flight): Flight => {
    const block = routeFor(prev.routes, f.from, f.to).blockMin;
    const tz = (code: string) => {
      const t = prev.airports.find(a => a.code.toUpperCase() === code.toUpperCase())?.tz;
      return t && validTz(t) ? t : homeTz;
    };
    const dep = wallToUtc(f.depart, tz(f.from));
    if (!block || !Number.isFinite(dep)) return f;
    return { ...f, arrive: utcToWall(dep + block * MIN, tz(f.to)) };
  };

  // Changing the route or the departure re-estimates the arrival; editing the arrival keeps it as typed.
  const editFlight = (id: string, patch: Partial<Flight>) =>
    update(prev => ({
      ...prev,
      flights: prev.flights.map(f => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        return 'from' in patch || 'to' in patch || 'depart' in patch ? withEstimate(prev, next) : next;
      }),
    }));
  const removeFlight = (id: string) => update(prev => ({ ...prev, flights: prev.flights.filter(f => f.id !== id) }));
  const editBreak = (f: Flight, i: number, patch: Partial<RestBreak>) =>
    editFlight(f.id, { breaks: f.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addLegAfter = (t: Trip) => {
    const last = t.flights[t.flights.length - 1];
    const to = baseCodes(p.homeBase)[0] || last.from;
    update(prev => ({
      ...prev,
      flights: [...prev.flights, withEstimate(prev, {
        id: uid(), label: '', from: last.to, to,
        depart: utcToWall(last.end + DAY, tzOf(last.to)).slice(0, 11) + '10:00',
        arrive: utcToWall(last.end + DAY + 4 * HOUR, tzOf(to)),
        breaks: [],
      })],
    }));
  };
  const removeTrip = (t: Trip) => {
    if (!window.confirm('Delete this trip and its flights?')) return;
    const ids = new Set(t.flights.map(f => f.id));
    update(prev => ({ ...prev, flights: prev.flights.filter(f => !ids.has(f.id)) }));
    setParams({ trip: null, edit: null });
  };

  const addTrip = (newFlights: Flight[], learned: Route[]) => {
    update(prev => {
      const routes = [...prev.routes];
      for (const r of learned) {
        const i = routes.findIndex(x => x.from.toUpperCase() === r.from && x.to.toUpperCase() === r.to);
        if (i >= 0) routes[i] = { ...routes[i], blockMin: r.blockMin, departTime: r.departTime, flightNo: r.flightNo ?? routes[i].flightNo };
        else routes.push(r);
      }
      return { ...prev, routes, flights: [...prev.flights, ...newFlights] };
    });
    setParams({ add: null, trip: newFlights[0].id, edit: null });
  };

  const editRoute = (i: number, patch: Partial<Route>) =>
    update(prev => ({ ...prev, routes: prev.routes.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const removeRoute = (i: number) => update(prev => ({ ...prev, routes: prev.routes.filter((_, j) => j !== i) }));
  const addRoute = () => {
    const from = newRoute.from.trim().toUpperCase();
    const to = newRoute.to.trim().toUpperCase();
    if (!from || !to || !newRoute.blockMin) return;
    update(prev => ({
      ...prev,
      routes: [...prev.routes.filter(r => !(r.from.toUpperCase() === from && r.to.toUpperCase() === to)), { from, to, blockMin: newRoute.blockMin }],
    }));
    setNewRoute({ from: '', to: '', blockMin: 0 });
  };

  const addSleep = (start: number, end: number) => {
    const tz = whereAt(start).tz;
    update(prev => ({
      ...prev,
      pendingStart: null,
      sleeps: [...prev.sleeps, { id: uid(), tz, start: utcToWall(start, tz), end: utcToWall(end, tz), quality: 3, note: '' }],
    }));
  };
  const editSleep = (id: string, patch: Partial<SleepEntry>) =>
    update(prev => ({ ...prev, sleeps: prev.sleeps.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeSleep = (id: string) => update(prev => ({ ...prev, sleeps: prev.sleeps.filter(s => s.id !== id) }));
  const endSleep = () => {
    if (p.pendingStart && Date.now() > p.pendingStart) addSleep(p.pendingStart, Date.now());
  };

  const sleepById = new Map(sleeps.map(s => [s.id, s]));
  const flightPlanById = new Map(flightPlans.map(fp => [fp.flight.id, fp]));
  const matches = (...fields: (string | undefined)[]) => {
    const q = netFilter.trim().toLowerCase();
    return !q || fields.some(f => (f || '').toLowerCase().includes(q));
  };
  const knownCodes = new Set(p.airports.map(a => a.code.toUpperCase()));
  const missingCodes = Array.from(new Set(p.flights.flatMap(f => [f.from, f.to]).map(c => c.toUpperCase()).filter(c => c && !knownCodes.has(c))));

  // ---- trip plan presentation --------------------------------------------

  const bases = baseCodes(p.homeBase);
  const tripTitle = (t: Trip) => [t.flights[0].from.toUpperCase(), ...t.flights.map(f => f.to.toUpperCase())].join(' → ');
  const shiftAt = (code: string, t: number) => (tzOffsetMin(tzOf(code), t) - tzOffsetMin(homeTz, t)) / 60;

  const eventTitle = (e: PlanEvent) => e.title || (e.recovery ? 'Recovery sleep' : EVENT_META[e.kind].label);
  const eventDetail = (e: PlanEvent) => {
    if (e.detail) return e.detail;
    if (e.recovery) return 'the night was missed: sleep as soon as you are in bed, then stay up until home bedtime';
    if (e.bankedMin) return `includes ${fmtDur(e.bankedMin)} extra: the next night is short, bank sleep now`;
    if (e.kind === 'caffeine') return `until home bedtime (${p.bedtime} home)`;
    if (e.kind === 'light') return 'your home morning: keeps your clock on home time';
    if (e.kind === 'dim') return 'the 2 h before home bedtime';
    if (e.kind === 'anchor') {
      const len = (e.end - e.start) / MIN;
      return `inside your home night, keeps your clock anchored · ${len < 180 ? 'minimum (1h30); 3h is better' : len === 180 ? 'good (3h)' : 'best: more than 3h'}`;
    }
    if (e.kind === 'melatonin') return `${fmtDur(p.melatoninLeadMin)} before sleeping in your home night · only as prescribed`;
    if (e.kind === 'strategic') return 'before a night flight or long duty: set an alarm, do not go past it';
    if (e.kind === 'nap') return 'home afternoon dip, before a night duty';
    if (e.kind === 'sleep' && !bases.includes(e.place)) return 'your home night: blackout curtains, eye mask, earplugs';
    return '';
  };

  /** How much of the home-night anchor core a sleep covers: 1h30 minimum, 3h good, more is better. */
  const coreLine = (e: PlanEvent) => {
    if (!isSleepKind(e.kind) || e.kind === 'strategic') return '';
    const m = overlapAll(e, cores) / MIN;
    if (m < 1) return '';
    const grade = m > 181 ? 'even better' : m >= 179 ? 'best' : m >= 90 ? 'minimum met, 3h is best' : 'below the 1h30 minimum';
    return `anchor core ${fmtDur(m)} · ${grade}`;
  };

  const tipFiltered = events.filter(e => showTips || !e.tip);
  // Keep the plan to what matters now: the last step that happened, then what is on and ahead.
  // A trip that is entirely over (or not started) shows everything.
  const firstLive = tipFiltered.findIndex(e => e.end >= now || e.start >= now);
  const hiddenCount = firstLive > 1 ? firstLive - 1 : 0;
  const shownEvents = showPast || hiddenCount === 0 ? tipFiltered : tipFiltered.slice(hiddenCount);
  const groups: { key: string; label: string; events: PlanEvent[] }[] = [];
  for (const e of shownEvents) {
    const day = dayLabel(e.start, e.tz);
    const key = `${day}|${e.tz}|${e.place === 'in flight'}`;
    const where = e.place === 'in flight' ? 'in flight (home time)'
      : bases.includes(e.place) ? `home (${cityOf(e.place) || e.place})`
      : `${cityOf(e.place) || e.place} (${fmtShift(shiftAt(e.place, e.start))})`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(e);
    else groups.push({ key, label: `${day} · ${where}`, events: [e] });
  }
  const nowIndex = shownEvents.findIndex(e => e.start > now);
  const totalDeficit = impact.reduce((acc, d) => acc + d.deficit, 0);
  const tripWarnings = events.filter(e => e.warn);

  return (
    <VStack align="stretch" gap={4} p={{ base: 2, md: 4 }} maxW="1100px" mx="auto">
      <datalist id="crew-sleep-tz">
        {ALL_TZ.map(tz => <option key={tz} value={tz} />)}
      </datalist>
      <datalist id="crew-sleep-ap">
        {p.airports.map(a => <option key={a.code} value={a.code}>{a.city}</option>)}
      </datalist>

      {/* Header */}
      <Flex justify="space-between" align="center" gap={2} flexWrap="wrap">
        <Box>
          <Heading size="lg" color="var(--heading-color)">Crew Sleep</Heading>
          <Text fontSize="xs" color={status === 'error' || status === 'missing' ? colors.warn : 'var(--muted-text)'}>
            {urlProfile ? `${urlProfile} · ` : ''}
            {status === 'saved' ? 'saved in this browser'
              : status === 'missing' ? 'profile not found in this browser: import its file in the configuration'
              : status === 'error' ? 'could not save: browser storage is full or blocked'
              : 'stay on home time wherever you fly'}
          </Text>
        </Box>
        <HStack gap={2} flexWrap="wrap">
          <Button size="sm" colorPalette="blue" onClick={() => setParams({ add: adding ? null : '1', tab: null })}><Plus size={14} /> Add trip</Button>
          {p.pendingStart ? (
            <Button size="sm" variant="outline" onClick={endSleep}><Sun size={14} /> I woke up</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => set('pendingStart', Date.now())}><BedDouble size={14} /> Going to sleep</Button>
          )}
          <Button size="sm" variant="ghost" aria-label="Configuration" onClick={() => setParams({ config: '1' })}><Settings size={16} /></Button>
        </HStack>
      </Flex>

      {/* Now */}
      <Card>
        <Flex gap={6} flexWrap="wrap" align="center">
          <HStack gap={3}>
            {phase.icon}
            <Box>
              <Text fontSize="xs" color="var(--muted-text)">Home · {phase.label}</Text>
              <Text fontSize="2xl" fontWeight="bold" lineHeight="1.1">{clock(now, homeTz)}</Text>
            </Box>
          </HStack>
          {here.away && (
            <Box>
              <Text fontSize="xs" color="var(--muted-text)">Here · {here.label}</Text>
              <Text fontSize="2xl" fontWeight="bold" lineHeight="1.1">{clock(now, here.tz)}</Text>
            </Box>
          )}
          <Box flex="1 1 260px">
            {p.pendingStart && (
              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="bold">
                  Asleep since {clock(p.pendingStart, whereAt(p.pendingStart).tz)} ({fmtH((now - p.pendingStart) / HOUR)})
                </Text>
                <Button size="2xs" variant="ghost" onClick={() => set('pendingStart', null)}>Cancel</Button>
              </HStack>
            )}
            {currentEvent ? (
              <Text fontSize="sm"><b>Now: {eventTitle(currentEvent)}</b> until {clock(currentEvent.end, currentEvent.tz)}</Text>
            ) : (
              <Text fontSize="sm">{phase.tip}</Text>
            )}
            {nextEvent && (
              <Text fontSize="sm" color="var(--muted-text)">
                Next: <b>{eventTitle(nextEvent)}</b> at {clock(nextEvent.start, nextEvent.tz)}{nextEvent.place === 'in flight' ? ' home time' : ''} (in {inTime(nextEvent.start - now)})
              </Text>
            )}
          </Box>
        </Flex>
      </Card>

      {/* Tabs */}
      <HStack gap={0} borderBottom="2px solid" borderColor="var(--border-color)">
        {([['plan', 'Trip plan'], ['history', 'History']] as const).map(([key, label]) => (
          <Box key={key} as="button" px={4} py={2} mb="-2px" fontSize="sm" fontWeight="bold" cursor="pointer"
            borderBottom="2px solid" borderColor={tab === key ? colors.sleep : 'transparent'}
            color={tab === key ? 'var(--heading-color)' : 'var(--muted-text)'}
            onClick={() => setParams({ tab: key === 'plan' ? null : key })}>
            {label}
          </Box>
        ))}
      </HStack>

      {tab === 'plan' && (<>
      {/* New trip */}
      {(adding || !trips.length) && (
        <AddTrip p={p} homeTz={homeTz} tzOf={tzOf} cityOf={cityOf} onAdd={addTrip} onCancel={() => setParams({ add: null })} />
      )}

      {/* Trip plan */}
      {trip && (
        <Card>
          <HStack gap={1} mb={3} flexWrap="wrap">
            {trips.filter(t => t.end > now - 14 * DAY || t.id === trip.id).map(t => (
              <Button key={t.id} size="xs" variant={t.id === trip.id ? 'solid' : 'outline'} opacity={t.end < now && t.id !== trip.id ? 0.6 : 1}
                onClick={() => setParams({ trip: t.id, edit: null, past: null })}>
                {dayLabel(t.start, tzOf(t.flights[0].from))} · {t.stops.join(' ') || tripTitle(t)}
              </Button>
            ))}
          </HStack>

          <Flex justify="space-between" align="flex-start" gap={3} flexWrap="wrap" mb={3}>
            <Box>
              <Heading size="md" color="var(--heading-color)">{tripTitle(trip)}</Heading>
              <Text fontSize="sm" color="var(--muted-text)">
                {dayLabel(trip.start, tzOf(trip.flights[0].from))} – {dayLabel(trip.end, tzOf(trip.flights[trip.flights.length - 1].to))}
                {trip.stops.map(s => ` · ${cityOf(s) || s} ${fmtShift(shiftAt(s, trip.start))}`).join('')}
              </Text>
            </Box>
            <HStack gap={1}>
              <Button size="xs" variant={editTrip ? 'solid' : 'outline'} onClick={() => setParams({ edit: editTrip ? null : '1' })}><Pencil size={12} /> Edit flights</Button>
              <Button size="xs" variant="ghost" aria-label="Delete trip" onClick={() => removeTrip(trip)}><Trash2 size={12} /></Button>
            </HStack>
          </Flex>

          {tripWarnings.map(w => (
            <HStack key={w.start} gap={2} mb={2} color={colors.warn} fontSize="sm" align="flex-start">
              <Box pt="2px"><ShieldAlert size={16} /></Box><Text>{w.title}: {w.detail}</Text>
            </HStack>
          ))}
          {gaps.map(g => <Text key={g} fontSize="xs" color={colors.warn} mb={1}>{g}</Text>)}

          {/* Flight editor */}
          {editTrip && (
            <VStack align="stretch" gap={2} mb={4}>
              {trip.flights.map(pf => {
                const f = p.flights.find(x => x.id === pf.id);
                const fp = flightPlanById.get(pf.id);
                if (!f || !fp) return null;
                const est = routeFor(p.routes, f.from, f.to).blockMin;
                return (
                  <Box key={f.id} border="1px solid" borderColor="var(--border-color)" borderRadius="md" p={3}>
                    <Flex gap={2} flexWrap="wrap" align="flex-end">
                      <Box w="80px"><Labeled label="Flight"><Input size="sm" value={f.label} onChange={e => editFlight(f.id, { label: e.target.value.toUpperCase() })} /></Labeled></Box>
                      <Box w="70px"><Labeled label="From"><Input size="sm" list="crew-sleep-ap" value={f.from} onChange={e => editFlight(f.id, { from: e.target.value.toUpperCase() })} /></Labeled></Box>
                      <Box w="70px"><Labeled label="To"><Input size="sm" list="crew-sleep-ap" value={f.to} onChange={e => editFlight(f.id, { to: e.target.value.toUpperCase() })} /></Labeled></Box>
                      <Box flex="1 1 180px"><Labeled label={`Depart (${f.from} local)`}><Input size="sm" type="datetime-local" value={f.depart} onChange={e => editFlight(f.id, { depart: e.target.value })} /></Labeled></Box>
                      <Box flex="1 1 180px"><Labeled label={`Arrive (${f.to} local)`}><Input size="sm" type="datetime-local" value={f.arrive} onChange={e => editFlight(f.id, { arrive: e.target.value })} /></Labeled></Box>
                      <Button size="sm" variant="ghost" aria-label="Remove flight" onClick={() => removeFlight(f.id)}><Trash2 size={14} /></Button>
                    </Flex>
                    <Text fontSize="xs" color="var(--muted-text)" mt={1}>
                      Block {fmtH((fp.flight.end - fp.flight.start) / HOUR)}{est ? ` (route estimate ${fmtH(est / 60)})` : ''}
                    </Text>
                    <Box overflowX="auto" mt={1}>
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                        <tbody>
                          {f.breaks.map((b, i) => {
                            const s = fp.breaks[i];
                            const best = i === fp.best;
                            return (
                              <tr key={i} style={{ borderTop: '1px solid var(--border-color)', fontWeight: best ? 600 : 400 }}>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>Bunk break {i + 1}</td>
                                <td style={tdStyle}><HStack gap={1}><Text fontSize="xs">after</Text><DurInput value={b.afterMin} onChange={m => editBreak(f, i, { afterMin: m })} w="70px" /></HStack></td>
                                <td style={tdStyle}><HStack gap={1}><Text fontSize="xs">for</Text><DurInput value={b.lengthMin} onChange={m => editBreak(f, i, { lengthMin: m })} w="70px" /></HStack></td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--muted-text)' }}>
                                  {s.sleep ? `sleep ${fmtDur(s.blockMin)}, ${s.fit === 'night' ? `${fmtDur(s.homeNightMin)} in home night` : s.fit === 'dip' ? 'home afternoon dip' : 'power nap only'}` : 'too short'}
                                  {best ? ' · recommended' : ''}
                                </td>
                                <td style={tdStyle}><Button size="xs" variant="ghost" aria-label="Remove break" onClick={() => editFlight(f.id, { breaks: f.breaks.filter((_, j) => j !== i) })}><X size={12} /></Button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Box>
                    <Button size="xs" variant="ghost" onClick={() => editFlight(f.id, { breaks: [...f.breaks, { afterMin: 60, lengthMin: 120 }] })}><Plus size={12} /> Bunk break</Button>
                  </Box>
                );
              })}
              <Box><Button size="xs" variant="outline" onClick={() => addLegAfter(trip)}><Plus size={12} /> Add a leg</Button></Box>
            </VStack>
          )}

          {/* Impact on sleep */}
          <Text fontSize="sm" fontWeight="bold" mb={1}>Sleep you can expect</Text>
          <Text fontSize="xs" color="var(--muted-text)" mb={2}>
            {totalDeficit > 30
              ? `Following the plan, this trip costs about ${fmtH(totalDeficit / 60)} of sleep; recover with full home nights afterwards.`
              : 'Following the plan, this trip keeps you close to your sleep need.'}
          </Text>
          <VStack align="stretch" gap={1} mb={4}>
            {impact.map(d => {
              const pct = Math.min(1.25, d.minutes / (p.targetHours * 60));
              const evening = wallToUtc(`${d.date}T12:00`, homeTz);
              return (
                <HStack key={d.date} gap={2} fontSize="xs">
                  <Text w="90px" flexShrink={0} color="var(--muted-text)">{dayLabel(evening, homeTz)}</Text>
                  <Box flex="1" position="relative" h="10px" bg="var(--border-color)" borderRadius="full">
                    <Box position="absolute" left={0} top={0} bottom={0} w={`${(pct / 1.25) * 100}%`} bg={colors.sleep} borderRadius="full" />
                    <Box position="absolute" left={`${(1 / 1.25) * 100}%`} top="-2px" bottom="-2px" w="2px" bg={colors.text} />
                  </Box>
                  <Text w="110px" flexShrink={0} textAlign="right">
                    {fmtH(d.minutes / 60)}{d.deficit > 30 && <Text as="span" color={colors.warn}> −{fmtH(d.deficit / 60)}</Text>}
                  </Text>
                </HStack>
              );
            })}
          </VStack>

          <ActoLegend colors={colors} />
          <Actogram homeTz={homeTz} dates={tripDates} nights={allNights} localNights={localNights} grounds={grounds}
            flights={flights} plans={planSleeps} cores={cores} commutes={commutes} sleeps={sleeps} now={now} colors={colors} />

          {/* Step by step */}
          <Flex justify="space-between" align="center" mt={5} mb={2}>
            <Text fontSize="sm" fontWeight="bold">Your plan, step by step</Text>
            <HStack as="label" gap={2} fontSize="xs" cursor="pointer">
              <input type="checkbox" checked={showTips} onChange={e => setParams({ tips: e.target.checked ? null : '0' })} />
              <span>Light & caffeine tips</span>
            </HStack>
          </Flex>
          {hiddenCount > 0 && (
            <Button size="xs" variant="ghost" mb={2} onClick={() => setParams({ past: showPast ? null : '1' })}>
              {showPast ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showPast ? 'Hide earlier steps' : `Show ${hiddenCount} earlier step${hiddenCount > 1 ? 's' : ''}`}
            </Button>
          )}
          <VStack align="stretch" gap={3}>
            {groups.map(g => (
              <Box key={g.key}>
                <Text fontSize="xs" fontWeight="bold" color="var(--muted-text)" textTransform="uppercase" letterSpacing="wide" mb={1}>{g.label}</Text>
                <VStack align="stretch" gap={0}>
                  {g.events.map(e => {
                    const idx = shownEvents.indexOf(e);
                    const sleepy = isSleepKind(e.kind);
                    const past = e.end < now && e.start < now;
                    return (
                      <React.Fragment key={`${e.kind}${e.start}`}>
                        {idx === nowIndex && nowIndex > 0 && (
                          <HStack gap={2} py={1}>
                            <Box flex="1" h="2px" bg={colors.now} />
                            <Text fontSize="2xs" color={colors.now} fontWeight="bold">NOW {clock(now, here.tz)}</Text>
                            <Box flex="1" h="2px" bg={colors.now} />
                          </HStack>
                        )}
                        <HStack gap={3} py={1.5} px={2} borderLeft="3px solid" align="flex-start"
                          borderColor={e.warn ? colors.warn : sleepy && overlapAll(e, cores) >= 90 * MIN ? colors.anchor : sleepy ? colors.sleep : 'transparent'}
                          opacity={past ? 0.55 : e.tip ? 0.85 : 1}>
                          <Box w="96px" flexShrink={0}>
                            <Text fontSize="sm" fontWeight="bold" fontFamily="mono">
                              {clock(e.start, e.tz)}{e.end > e.start ? `–${clock(e.end, e.tz)}` : ''}
                            </Text>
                            {e.tz !== homeTz && <Text fontSize="2xs" color="var(--muted-text)">home {clock(e.start, homeTz)}</Text>}
                          </Box>
                          <Box color={e.warn ? colors.warn : e.kind === 'anchor' ? colors.anchor : sleepy ? colors.sleep : 'var(--muted-text)'} pt="2px">
                            {e.kind === 'rest' && e.warn ? <ShieldAlert size={16} /> : EVENT_META[e.kind].icon}
                          </Box>
                          <Box flex="1" minW={0}>
                            <Text fontSize="sm" fontWeight={sleepy || e.kind === 'depart' ? 'bold' : 'normal'} color={e.warn ? colors.warn : undefined}>
                              {eventTitle(e)}
                              {e.end > e.start && <Text as="span" fontWeight="normal" color="var(--muted-text)"> · {fmtDur((e.end - e.start) / MIN)}</Text>}
                            </Text>
                            {eventDetail(e) && <Text fontSize="xs" color="var(--muted-text)">{eventDetail(e)}</Text>}
                            {coreLine(e) && <Text fontSize="xs" color={colors.anchor}>{coreLine(e)}</Text>}
                          </Box>
                        </HStack>
                      </React.Fragment>
                    );
                  })}
                </VStack>
              </Box>
            ))}
          </VStack>
          {groundPlans.filter(gp => !gp.ground.isHome && trip.flights.some(f => f.id === gp.ground.inbound?.id)).map(gp => (
            <Text key={gp.ground.id} fontSize="xs" color="var(--muted-text)" mt={3}>
              <b>{cityOf(gp.ground.code) || gp.ground.code}:</b> {gp.advice}
            </Text>
          ))}
        </Card>
      )}

      </>)}

      {tab === 'history' && (<>
      {/* History */}
      <Flex justify="flex-end" align="center">
        <HStack gap={1}>
          {[7, 14, 30, 90].map(d => (
            <Button key={d} size="xs" variant={d === days ? 'solid' : 'outline'} onClick={() => setParams({ days: String(d) })}>{d}d</Button>
          ))}
        </HStack>
      </Flex>
      <Flex gap={3} flexWrap="wrap">
        <StatTile label="Average sleep (7 days)" value={fmtH(stats.avg)} sub={`need ${fmtH(p.targetHours)} per day`} />
        <StatTile label="Sleep debt (7 days)" value={fmtH(stats.debt)} />
        <StatTile label="Slept inside home night" value={`${Math.round(stats.alignment * 100)}%`} sub={`${stats.count} sleeps`} />
        <StatTile label="Main-sleep drift" value={fmtH(stats.drift)} sub="from your usual home night" />
      </Flex>
      <Card>
        <ActoLegend colors={colors} />
        <Actogram homeTz={homeTz} dates={dates} nights={allNights} localNights={localNights} grounds={grounds}
          flights={flights} plans={planSleeps} cores={cores} commutes={commutes} sleeps={sleeps} now={now} colors={colors} />
      </Card>
      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 0" minW="280px"><VegaProvider><VegaPlot spec={dailySpec} height="240px" /></VegaProvider></Box>
        <Box flex="1 1 0" minW="280px"><VegaProvider><VegaPlot spec={driftSpec} height="240px" /></VegaProvider></Box>
      </Flex>

      {/* Sleep log */}
      <Card title={
        <HStack gap={2} cursor="pointer" onClick={() => setParams({ log: showLog ? null : '1' })}>
          {showLog ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <BedDouble size={16} /><span>Sleep log ({p.sleeps.length})</span>
        </HStack>
      }>
        {showLog && (
          <>
            <Text fontSize="xs" color="var(--muted-text)" mb={3}>
              Times are local to where you slept (home time for sleep in flight).
            </Text>
            <Box overflowX="auto">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Start (local)</th><th style={thStyle}>End (local)</th><th style={thStyle}>Time zone</th>
                    <th style={thStyle}>Home</th><th style={thStyle}>Length</th><th style={thStyle}>In home night</th>
                    <th style={thStyle}>Quality</th><th style={thStyle}>Note</th><th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {[...p.sleeps].sort((a, b) => (sleepById.get(b.id)?.start ?? 0) - (sleepById.get(a.id)?.start ?? 0)).map(raw => {
                    const s = sleepById.get(raw.id);
                    return (
                      <tr key={raw.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={tdStyle}><Input size="xs" type="datetime-local" value={raw.start} onChange={e => editSleep(raw.id, { start: e.target.value })} /></td>
                        <td style={tdStyle}><Input size="xs" type="datetime-local" value={raw.end} onChange={e => editSleep(raw.id, { end: e.target.value })} /></td>
                        <td style={{ ...tdStyle, minWidth: 150 }}><TzInput size="xs" value={raw.tz} onChange={v => editSleep(raw.id, { tz: v })} /></td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--muted-text)' }}>{s ? `${clock(s.start, homeTz)}–${clock(s.end, homeTz)}` : '—'}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{s ? fmtH(s.hours) : <span style={{ color: colors.warn }}>invalid</span>}</td>
                        <td style={tdStyle}>{s ? `${Math.round(s.homeOverlap * 100)}%` : '—'}</td>
                        <td style={tdStyle}>
                          <select value={raw.quality} onChange={e => editSleep(raw.id, { quality: Number(e.target.value) })}
                            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }}>
                            {[1, 2, 3, 4, 5].map(q => <option key={q} value={q}>{'★'.repeat(q)}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}><Input size="xs" value={raw.note} onChange={e => editSleep(raw.id, { note: e.target.value })} /></td>
                        <td style={tdStyle}><Button size="xs" variant="ghost" aria-label="Remove sleep" onClick={() => removeSleep(raw.id)}><Trash2 size={12} /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Box>
            <Box mt={3}>
              <Button size="sm" variant="outline" onClick={() => addSleep(now - 8 * HOUR, now)}><Plus size={14} /> Add sleep</Button>
            </Box>
          </>
        )}
      </Card>
      </>)}

      {/* Configuration */}
      <Dialog.Root open={configOpen} onOpenChange={(d: { open: boolean }) => { if (!d.open) setParams({ config: null }); }} placement="center" scrollBehavior="inside">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="960px" width="95vw" maxH="90vh">
              <Dialog.Header>
                <Dialog.Title><HStack gap={2}><Settings size={18} /><span>Configuration</span></HStack></Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" position="absolute" top={3} right={3} />
              </Dialog.CloseTrigger>
              <Dialog.Body>
                <VStack align="stretch" gap={7} pb={4}>
                  {/* Profile & backup */}
                  <Box>
                    <Heading size="xs" mb={2} color="var(--heading-color)">Profile & backup</Heading>
                    <HStack gap={2} flexWrap="wrap">
                      <Input size="sm" maxW="200px" placeholder="Profile name" value={name} onChange={e => setName(e.target.value)} />
                      <Button size="sm" onClick={handleSave} disabled={!name.trim() || name.trim() === urlProfile}><Save size={14} /> Save</Button>
                      <Button size="sm" variant="outline" onClick={handleDownload}><Download size={14} /> Download</Button>
                      <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Upload size={14} /> Import</Button>
                      <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
                      <Button size="sm" variant="outline" onClick={handleDelete} disabled={!urlProfile}><Trash2 size={14} /> Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Replace the current profile with example data?')) update(() => exampleProfile()); }}><Sparkles size={14} /> Load example</Button>
                    </HStack>
                    {savedNames.length > 0 && (
                      <HStack gap={1} mt={2} flexWrap="wrap">
                        {savedNames.map(s => (
                          <Button key={s} size="xs" variant="outline" colorPalette={s === urlProfile ? 'blue' : undefined}
                            onClick={() => navigate(profilePath(s))}>
                            <FolderOpen size={12} /> {s}
                          </Button>
                        ))}
                      </HStack>
                    )}
                    <Text fontSize="2xs" color="var(--muted-text)" mt={2}>
                      Everything (trips, sleep log and this configuration) is saved in this browser as you go. Clearing site data or
                      changing device loses it: download a copy for safekeeping.
                    </Text>
                  </Box>

                  {/* Home clock & sleep */}
                  <Box>
                    <Heading size="xs" mb={2} color="var(--heading-color)">Home clock & sleep</Heading>
                    <Flex gap={3} flexWrap="wrap" align="flex-end">
                      <Box flex="1 1 180px"><Labeled label="Home time zone"><TzInput value={p.homeTz} onChange={v => set('homeTz', v)} /></Labeled></Box>
                      <Box w="110px"><Labeled label="Home base(s)"><Input size="sm" value={p.homeBase} placeholder="ICN GMP" onChange={e => set('homeBase', e.target.value.toUpperCase())} /></Labeled></Box>
                      <Labeled label="Usual bedtime"><Input size="sm" type="time" value={p.bedtime} onChange={e => set('bedtime', e.target.value)} /></Labeled>
                      <Labeled label="Usual wake"><Input size="sm" type="time" value={p.wake} onChange={e => set('wake', e.target.value)} /></Labeled>
                      <Box w="100px"><Labeled label="Sleep need (h)"><Input size="sm" type="number" step={0.5} value={p.targetHours} onChange={e => set('targetHours', Number(e.target.value))} /></Labeled></Box>
                    </Flex>
                    <Box mt={3}>
                      <Labeled label="Sleep blocks (naps and short sleeps snap to the longest one that fits)">
                        <HStack gap={1} flexWrap="wrap">
                          {options.map(m => (
                            <HStack key={m} gap={1} px={2} py={0.5} borderRadius="full" border="1px solid" borderColor="var(--border-color)" fontSize="xs">
                              <span>{fmtDur(m)}</span>
                              <Box as="button" aria-label={`Remove ${fmtDur(m)}`} onClick={() => set('napOptionsMin', options.filter(o => o !== m))} display="flex"><X size={10} /></Box>
                            </HStack>
                          ))}
                          <DurInput value={0} clearOnCommit placeholder="+ 4h30" onChange={m => { if (m > 0) set('napOptionsMin', [...options, m]); }} />
                          <Button size="xs" variant="ghost" onClick={() => set('napOptionsMin', DEFAULT_NAP_OPTIONS)}>Reset</Button>
                        </HStack>
                      </Labeled>
                    </Box>
                    <Flex gap={4} mt={3} flexWrap="wrap" align="flex-end">
                      <Labeled label="Max sleep in the bunk"><DurInput value={p.maxBunkRestMin} onChange={m => set('maxBunkRestMin', m)} /></Labeled>
                      <Labeled label="Time to fall asleep in the bunk"><DurInput value={p.bunkSettleMin} onChange={m => set('bunkSettleMin', m)} /></Labeled>
                      <Labeled label="Meal service after takeoff"><DurInput value={p.serviceAfterTakeoffMin} onChange={m => set('serviceAfterTakeoffMin', m)} /></Labeled>
                      <Labeled label="Meal service before landing"><DurInput value={p.serviceBeforeLandingMin} onChange={m => set('serviceBeforeLandingMin', m)} /></Labeled>
                    </Flex>
                    <Flex gap={4} mt={3} flexWrap="wrap" align="flex-end">
                      <HStack as="label" gap={2} fontSize="xs" fontWeight="bold" cursor="pointer" pb={1}>
                        <input type="checkbox" checked={p.strategicNap} onChange={e => set('strategicNap', e.target.checked)} />
                        <span>Strategic nap in the crew lounge before a night flight or long duty</span>
                      </HStack>
                      <Labeled label="Strategic nap"><DurInput value={p.strategicNapMin} onChange={m => set('strategicNapMin', m)} /></Labeled>
                      <HStack as="label" gap={2} fontSize="xs" fontWeight="bold" cursor="pointer" pb={1}>
                        <input type="checkbox" checked={p.melatonin} onChange={e => set('melatonin', e.target.checked)} />
                        <span>Melatonin reminder</span>
                      </HStack>
                      <Labeled label="Melatonin before sleep"><DurInput value={p.melatoninLeadMin} onChange={m => set('melatoninLeadMin', m)} /></Labeled>
                      <Labeled label="Anchor core"><DurInput value={p.anchorCoreMin} onChange={m => set('anchorCoreMin', m)} /></Labeled>
                      <Labeled label="Extra sleep before a short night"><DurInput value={p.sleepBankMin} onChange={m => set('sleepBankMin', m)} /></Labeled>
                    </Flex>
                    <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
                      Anchor core: the block in the middle of your home night you should sleep through every day, wherever you are.
                      1h30 is the minimum, 3h is good, more is better. Shown in green on the timeline.
                    </Text>
                    <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
                      Melatonin: reminder on layovers only, before sleep in your home night (when it is often daytime locally), and
                      at least 8 h before the next sign-on. Only if your doctor allows it: it is prescription-only in some countries,
                      including Korea, and many airlines restrict sleep aids before duty. Untick to hide the reminders.
                    </Text>
                    <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
                      When the next night is short (overnight flight, early report), the night before is extended by up to this
                      much: sleep in first, then go to bed earlier. 0 turns it off.
                    </Text>
                    <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
                      In-flight sleep never goes past the max, whatever the break length, and never falls inside the meal services:
                      set them to what your cabin duties really allow.
                    </Text>
                  </Box>

                  {/* Duty & mandatory rest */}
                  <Box>
                    <Heading size="xs" mb={2} color="var(--heading-color)">Duty & mandatory rest</Heading>
                    <Flex gap={4} flexWrap="wrap" align="flex-end">
                      <Labeled label="Report before departure"><DurInput value={p.reportMin} onChange={m => set('reportMin', m)} /></Labeled>
                      <Labeled label="Sign-off after block-in"><DurInput value={p.debriefMin} onChange={m => set('debriefMin', m)} /></Labeled>
                      <Labeled label="Minimum rest at base"><DurInput value={p.restHomeMin} onChange={m => set('restHomeMin', m)} /></Labeled>
                      <Labeled label="Minimum rest away"><DurInput value={p.restAwayMin} onChange={m => set('restAwayMin', m)} /></Labeled>
                      <HStack as="label" gap={2} fontSize="xs" fontWeight="bold" cursor="pointer" pb={1}>
                        <input type="checkbox" checked={p.restAtLeastDuty} onChange={e => set('restAtLeastDuty', e.target.checked)} />
                        <span>Rest at least as long as the preceding duty</span>
                      </HStack>
                    </Flex>
                    <Text fontSize="2xs" color="var(--muted-text)" mt={2}>
                      Duty runs from report before the first flight to sign-off after the last; ground stops under 4 h are turnarounds
                      inside the same duty. Set these to your airline's flight time limitation rules.
                    </Text>
                  </Box>

                  {/* Airports & routes */}
                  <Box>
                    <Flex justify="space-between" align="center" gap={2} flexWrap="wrap" mb={2}>
                      <HStack gap={2}><MapPin size={14} /><Heading size="xs" color="var(--heading-color)">Airports & routes</Heading></HStack>
                      <HStack gap={2} flexWrap="wrap">
                        <Input size="xs" w="170px" placeholder="Filter: code or city…" value={netFilter} onChange={e => setNetFilter(e.target.value)} />
                        <Button size="xs" variant="outline" onClick={() => update(prev => mergeNetwork(prev))}><Plus size={12} /> Add missing Trinity data</Button>
                        <Button size="xs" variant="ghost" onClick={() => {
                          if (window.confirm('Replace all airports and routes with the Trinity Airways defaults? Your edits to them are lost.')) {
                            update(prev => ({ ...prev, airports: networkAirports(), routes: networkRoutes() }));
                          }
                        }}>Reset to Trinity defaults</Button>
                      </HStack>
                    </Flex>
                    <Text fontSize="xs" color="var(--muted-text)" mb={2}>
                      Per airport: block-in until in bed (deplane, commute, shower, prepare) and out of bed until departure
                      (prepare, commute, report). Durations accept 90, 1h30 or 1:30.
                    </Text>
                    <Box overflowX="auto" overflowY="auto" maxH="300px">
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg-raised)' }}>
                          <tr>
                            <th style={thStyle}>Code</th><th style={thStyle}>City</th><th style={thStyle}>Time zone</th>
                            <th style={thStyle}>Block-in → in bed</th><th style={thStyle}>Out of bed → departure</th><th style={thStyle} />
                          </tr>
                        </thead>
                        <tbody>
                          {p.airports.filter(a => matches(a.code, a.city)).map(a => (
                            <tr key={a.code} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{a.code}{bases.includes(a.code) ? ' (base)' : ''}</td>
                              <td style={{ ...tdStyle, minWidth: 140 }}><Input size="xs" value={a.city || ''} onChange={e => editAirport(a.code, { city: e.target.value })} /></td>
                              <td style={{ ...tdStyle, minWidth: 170 }}><TzInput size="xs" value={a.tz} onChange={v => editAirport(a.code, { tz: v })} /></td>
                              <td style={tdStyle}><DurInput value={a.toBedMin} onChange={m => editAirport(a.code, { toBedMin: m })} /></td>
                              <td style={tdStyle}><DurInput value={a.fromBedMin} onChange={m => editAirport(a.code, { fromBedMin: m })} /></td>
                              <td style={tdStyle}><Button size="xs" variant="ghost" aria-label={`Remove ${a.code}`} onClick={() => removeAirport(a.code)}><Trash2 size={12} /></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>
                    <HStack mt={2} gap={2} flexWrap="wrap">
                      {missingCodes.map(c => (
                        <Button key={c} size="xs" variant="outline" colorPalette="orange" onClick={() => ensureAirport(c)}>
                          <Plus size={12} /> Add {c}{KNOWN_AIRPORTS[c] ? ` (${KNOWN_AIRPORTS[c]})` : ''}
                        </Button>
                      ))}
                      <Input size="xs" w="110px" placeholder="Add code…" onKeyDown={e => {
                        if (e.key === 'Enter') { ensureAirport((e.target as HTMLInputElement).value.trim()); (e.target as HTMLInputElement).value = ''; }
                      }} />
                    </HStack>

                    <Text fontSize="xs" fontWeight="bold" mt={5} mb={1}>Routes</Text>
                    <Text fontSize="xs" color="var(--muted-text)" mb={2}>
                      Block times are estimates; usual departure and flight number are learned from the trips you add.
                    </Text>
                    <Box overflowX="auto" overflowY="auto" maxH="300px">
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg-raised)' }}>
                          <tr>
                            <th style={thStyle}>From</th><th style={thStyle}>To</th><th style={thStyle}>Block</th>
                            <th style={thStyle}>Usual departure (local)</th><th style={thStyle}>Flight no.</th><th style={thStyle} />
                          </tr>
                        </thead>
                        <tbody>
                          {p.routes.map((r, i) => ({ r, i })).filter(({ r }) => matches(r.from, cityOf(r.from), r.to, cityOf(r.to))).map(({ r, i }) => (
                            <tr key={`${r.from}>${r.to}`} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={tdStyle}><b>{r.from}</b> <span style={{ color: 'var(--muted-text)' }}>{cityOf(r.from)}</span></td>
                              <td style={tdStyle}><b>{r.to}</b> <span style={{ color: 'var(--muted-text)' }}>{cityOf(r.to)}</span></td>
                              <td style={tdStyle}><DurInput value={r.blockMin} onChange={m => editRoute(i, { blockMin: m })} /></td>
                              <td style={tdStyle}><Input size="xs" type="time" w="110px" value={r.departTime || ''} onChange={e => editRoute(i, { departTime: e.target.value || undefined })} /></td>
                              <td style={tdStyle}><Input size="xs" w="80px" value={r.flightNo || ''} onChange={e => editRoute(i, { flightNo: e.target.value.toUpperCase() || undefined })} /></td>
                              <td style={tdStyle}><Button size="xs" variant="ghost" aria-label={`Remove ${r.from}-${r.to}`} onClick={() => removeRoute(i)}><Trash2 size={12} /></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>
                    <HStack mt={2} gap={2} flexWrap="wrap">
                      <Input size="xs" w="70px" list="crew-sleep-ap" placeholder="From" value={newRoute.from} onChange={e => setNewRoute(r => ({ ...r, from: e.target.value.toUpperCase() }))} />
                      <Input size="xs" w="70px" list="crew-sleep-ap" placeholder="To" value={newRoute.to} onChange={e => setNewRoute(r => ({ ...r, to: e.target.value.toUpperCase() }))} />
                      <DurInput value={newRoute.blockMin} onChange={m => setNewRoute(r => ({ ...r, blockMin: m }))} />
                      <Button size="xs" variant="outline" onClick={addRoute} disabled={!newRoute.from || !newRoute.to || !newRoute.blockMin}><Plus size={12} /> Add route</Button>
                    </HStack>
                  </Box>
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </VStack>
  );
};

export default CrewSleep;
