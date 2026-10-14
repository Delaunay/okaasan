import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Input, Button } from '@chakra-ui/react';
import {
  Save, Trash2, FolderOpen, Plus, Moon, Sun, Coffee, Plane, BedDouble, AlarmClock,
  ChevronDown, ChevronRight, Glasses, Sparkles, MapPin, X,
} from 'lucide-react';
import { privateJsonStore } from '../../services/jsonstore';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';
import { useColorModeValue } from '../ui/color-mode';

// ---------------------------------------------------------------------------
// Model
//
// All user-entered times are wall-clock strings ("YYYY-MM-DDTHH:mm") in the
// time zone of the place they happened, which is how crew think about them.
// They are converted to UTC milliseconds for every computation.
//
// The rotation is a list of flights. Ground periods (layovers) are derived
// from consecutive flights: arrive at X, next departure from X.
// ---------------------------------------------------------------------------

interface Airport {
  code: string;
  tz: string;
  toBedMin: number;    // block-in -> in bed: deplane, commute, shower, prepare
  fromBedMin: number;  // out of bed -> departure: prepare, commute, report
}

interface RestBreak {
  afterMin: number;    // starts this long after departure
  lengthMin: number;
}

interface Flight {
  id: string;
  label: string;
  from: string;        // airport code
  to: string;
  depart: string;      // local wall time at `from`
  arrive: string;      // local wall time at `to`
  breaks: RestBreak[]; // in-flight crew rest options
}

interface SleepEntry {
  id: string;
  tz: string;
  start: string;    // wall time in tz
  end: string;      // wall time in tz
  quality: number;  // 1..5
  note: string;
}

interface Profile {
  homeTz: string;
  homeBase: string;       // airport code
  bedtime: string;        // home clock, HH:mm
  wake: string;           // home clock, HH:mm
  targetHours: number;
  napOptionsMin: number[]; // allowed sleep block lengths (sleep-cycle aligned)
  bunkSettleMin: number;   // time to fall asleep in the crew bunk
  airports: Airport[];
  flights: Flight[];
  sleeps: SleepEntry[];
  pendingStart: number | null; // UTC ms of "going to sleep" tap
}

interface Iv { start: number; end: number }
interface Night extends Iv { date: string }
type ParsedFlight = Flight & Iv;
type ParsedSleep = Omit<SleepEntry, 'start' | 'end'> & Iv & { hours: number; homeOverlap: number; drift: number };

interface Ground extends Iv {
  id: string;
  code: string;
  tz: string;
  airport: Airport;
  isHome: boolean;
  inbound: ParsedFlight;
  outbound: ParsedFlight;
}

type PlanKind = 'sleep' | 'anchor' | 'nap' | 'inflight' | 'light' | 'dim' | 'caffeine';
interface PlanItem extends Iv { kind: PlanKind }

interface GroundPlan {
  ground: Ground;
  shift: number;
  hours: number;
  window: Iv | null;
  items: PlanItem[];
  advice: string;
}

interface BreakScore extends Iv {
  homeNightMin: number;
  dipMin: number;
  blockMin: number;
  sleep: Iv | null;
  fit: 'night' | 'dip' | 'power' | 'none';
}
interface FlightPlan {
  flight: ParsedFlight;
  breaks: BreakScore[];
  best: number;          // index into breaks, -1 if none usable
  item: PlanItem | null;
}

const COLLECTION = 'crew-sleep';
const BASE = '/scratch/crew-sleep';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SLEEP_KINDS: PlanKind[] = ['sleep', 'anchor', 'nap', 'inflight'];

// 30 min power nap, then whole 90 min sleep cycles, plus a full and a long night.
const DEFAULT_NAP_OPTIONS = [30, 90, 180, 360, 480, 540];

const KNOWN_AIRPORTS: Record<string, string> = {
  YUL: 'America/Toronto', YYZ: 'America/Toronto', YOW: 'America/Toronto', YQB: 'America/Toronto',
  YVR: 'America/Vancouver', YYC: 'America/Edmonton', YEG: 'America/Edmonton', YHZ: 'America/Halifax', YWG: 'America/Winnipeg',
  JFK: 'America/New_York', EWR: 'America/New_York', BOS: 'America/New_York', MIA: 'America/New_York', ATL: 'America/New_York',
  ORD: 'America/Chicago', DFW: 'America/Chicago', DEN: 'America/Denver', PHX: 'America/Phoenix',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SEA: 'America/Los_Angeles', HNL: 'Pacific/Honolulu',
  CUN: 'America/Cancun', MEX: 'America/Mexico_City', PUJ: 'America/Santo_Domingo', HAV: 'America/Havana',
  BOG: 'America/Bogota', LIM: 'America/Lima', GRU: 'America/Sao_Paulo', EZE: 'America/Argentina/Buenos_Aires', SCL: 'America/Santiago',
  CDG: 'Europe/Paris', ORY: 'Europe/Paris', NCE: 'Europe/Paris', LYS: 'Europe/Paris', MRS: 'Europe/Paris', TLS: 'Europe/Paris',
  LHR: 'Europe/London', LGW: 'Europe/London', DUB: 'Europe/Dublin', AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels',
  FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich', VIE: 'Europe/Vienna',
  MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', LIS: 'Europe/Lisbon', FCO: 'Europe/Rome', MXP: 'Europe/Rome',
  ATH: 'Europe/Athens', IST: 'Europe/Istanbul', CPH: 'Europe/Copenhagen', OSL: 'Europe/Oslo', ARN: 'Europe/Stockholm',
  CAI: 'Africa/Cairo', CMN: 'Africa/Casablanca', ALG: 'Africa/Algiers', TUN: 'Africa/Tunis', DSS: 'Africa/Dakar',
  JNB: 'Africa/Johannesburg', NBO: 'Africa/Nairobi', ADD: 'Africa/Addis_Ababa',
  DXB: 'Asia/Dubai', DOH: 'Asia/Qatar', TLV: 'Asia/Jerusalem', DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata',
  SIN: 'Asia/Singapore', HKG: 'Asia/Hong_Kong', PEK: 'Asia/Shanghai', PVG: 'Asia/Shanghai', TPE: 'Asia/Taipei',
  ICN: 'Asia/Seoul', NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', BKK: 'Asia/Bangkok', MNL: 'Asia/Manila',
  SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane', AKL: 'Pacific/Auckland',
};

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
})();

const ALL_TZ: string[] = (() => {
  try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; }
})();

const newAirport = (code: string, fallbackTz: string): Airport => ({
  code, tz: KNOWN_AIRPORTS[code] || fallbackTz, toBedMin: 90, fromBedMin: 150,
});

const newProfile = (): Profile => ({
  homeTz: DEFAULT_TZ,
  homeBase: '',
  bedtime: '23:00',
  wake: '07:00',
  targetHours: 8,
  napOptionsMin: DEFAULT_NAP_OPTIONS,
  bunkSettleMin: 15,
  airports: [],
  flights: [],
  sleeps: [],
  pendingStart: null,
});

// ---------------------------------------------------------------------------
// Time zone helpers (Intl only, no date library)
// ---------------------------------------------------------------------------

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    } as Intl.DateTimeFormatOptions);
    fmtCache.set(tz, f);
  }
  return f;
}

function validTz(tz: string) {
  if (!tz) return false;
  try { partsFmt(tz); return true; } catch { return false; }
}

function wallParts(utc: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of partsFmt(tz).formatToParts(new Date(utc))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return { year: o.year, month: o.month, day: o.day, hour: o.hour % 24, minute: o.minute, second: o.second };
}

function tzOffsetMin(tz: string, utc: number) {
  const p = wallParts(utc, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utc) / MIN);
}

function wallToUtc(wall: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall || '');
  if (!m) return NaN;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = naive - tzOffsetMin(tz, naive) * MIN;
  utc = naive - tzOffsetMin(tz, utc) * MIN;
  return utc;
}

const pad = (n: number) => String(n).padStart(2, '0');

function utcToWall(utc: number, tz: string) {
  const p = wallParts(utc, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const clock = (utc: number, tz: string) => utcToWall(utc, tz).slice(11, 16);

function dayLabel(utc: number, tz: string) {
  return new Date(utc).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
}

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const hm = (s: string) => {
  const [h, m] = (s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function intersect(a: Iv, b: Iv): Iv | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

const overlap = (a: Iv, b: Iv) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const overlapAll = (a: Iv, list: Iv[]) => list.reduce((acc, b) => acc + overlap(a, b), 0);

const fmtH = (h: number) => {
  const sign = h < 0 ? '-' : '';
  const a = Math.abs(h);
  const hh = Math.floor(a);
  const mm = Math.round((a - hh) * 60);
  return mm === 60 ? `${sign}${hh + 1}h00` : `${sign}${hh}h${pad(mm)}`;
};

const fmtShift = (h: number) => (h === 0 ? '±0 h' : `${h > 0 ? '+' : '−'}${Math.abs(h) % 1 ? Math.abs(h).toFixed(1) : Math.abs(h)} h`);

/** Duration in minutes from "90", "90m", "1h30", "1h", "1:30". */
function parseDur(s: string): number {
  const t = s.trim().toLowerCase();
  let m = /^(\d+)\s*h\s*(\d+)?\s*(m|min)?$/.exec(t);
  if (m) return +m[1] * 60 + +(m[2] || 0);
  m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d+)\s*(m|min)?$/.exec(t);
  if (m) return +m[1];
  return NaN;
}

const fmtDur = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}`;
};

/** Longest allowed sleep block that fits in `availMin`, 0 if none. */
function largestFit(availMin: number, options: number[]) {
  let best = 0;
  for (const o of options) if (o <= availMin + 0.5 && o > best) best = o;
  return best;
}

/** Habitual nights (bedtime -> wake) in `tz`, covering [from, to]. */
function nightsIn(tz: string, bed: string, wake: string, from: number, to: number): Night[] {
  const out: Night[] = [];
  if (!(to > from)) return out;
  const bedMin = hm(bed);
  const wakeMin = hm(wake);
  const last = addDays(utcToWall(to, tz).slice(0, 10), 1);
  for (let d = addDays(utcToWall(from, tz).slice(0, 10), -1); d <= last; d = addDays(d, 1)) {
    // A night belongs to the evening date `d`; a bedtime after midnight falls on d+1.
    const bedDate = bedMin >= 12 * 60 ? d : addDays(d, 1);
    const start = wallToUtc(`${bedDate}T${bed}`, tz);
    const end = wallToUtc(`${wakeMin > bedMin ? bedDate : addDays(bedDate, 1)}T${wake}`, tz);
    if (end > from && start < to) out.push({ start, end, date: d });
  }
  return out;
}

/** Signed hours between a sleep midpoint and the habitual home-night midpoint, in [-12, 12). */
function driftHours(iv: Iv, homeTz: string, bed: string, wake: string) {
  const bedMin = hm(bed);
  const len = (hm(wake) - bedMin + 1440) % 1440;
  const habitualMid = (bedMin + len / 2) % 1440;
  const p = wallParts((iv.start + iv.end) / 2, homeTz);
  const mid = p.hour * 60 + p.minute;
  return (((mid - habitualMid + 720) % 1440 + 1440) % 1440 - 720) / 60;
}

// ---------------------------------------------------------------------------
// Rotation: flights -> ground periods
// ---------------------------------------------------------------------------

function parseRotation(p: Profile, homeTz: string) {
  const airports = new Map(p.airports.map(a => [a.code.toUpperCase(), a]));
  const apOf = (code: string) => airports.get(code.toUpperCase());
  const tzOf = (code: string) => {
    const tz = apOf(code)?.tz;
    return tz && validTz(tz) ? tz : homeTz;
  };

  const flights: ParsedFlight[] = p.flights
    .map(f => ({ ...f, start: wallToUtc(f.depart, tzOf(f.from)), end: wallToUtc(f.arrive, tzOf(f.to)) }))
    .filter(f => f.end > f.start)
    .sort((a, b) => a.start - b.start);

  const grounds: Ground[] = [];
  const gaps: string[] = [];
  for (let i = 0; i + 1 < flights.length; i++) {
    const inbound = flights[i];
    const outbound = flights[i + 1];
    if (outbound.start <= inbound.end) { gaps.push(`${inbound.label || inbound.id} overlaps the next flight`); continue; }
    if (inbound.to.toUpperCase() !== outbound.from.toUpperCase()) {
      gaps.push(`Arrive ${inbound.to} but next departure is from ${outbound.from}`);
      continue;
    }
    const code = inbound.to.toUpperCase();
    grounds.push({
      id: `${inbound.id}>${outbound.id}`,
      code,
      tz: tzOf(code),
      airport: apOf(code) || newAirport(code, homeTz),
      isHome: code === p.homeBase.toUpperCase(),
      start: inbound.end,
      end: outbound.start,
      inbound,
      outbound,
    });
  }
  return { flights, grounds, gaps, tzOf, apOf };
}

// ---------------------------------------------------------------------------
// Recommendations: hold home time
// ---------------------------------------------------------------------------

const KIND_META: Record<PlanKind, { label: string; icon: React.ReactNode }> = {
  sleep: { label: 'Main sleep: your home night', icon: <BedDouble size={14} /> },
  anchor: { label: 'Anchor sleep: protect it', icon: <Moon size={14} /> },
  nap: { label: 'Nap: top up after a short night', icon: <AlarmClock size={14} /> },
  inflight: { label: 'In-flight rest (bunk)', icon: <Plane size={14} /> },
  light: { label: 'Bright light / go outside: home morning', icon: <Sun size={14} /> },
  dim: { label: 'Dim lights, sunglasses outside: before home bedtime', icon: <Glasses size={14} /> },
  caffeine: { label: 'No caffeine until home bedtime', icon: <Coffee size={14} /> },
};

function groundAdvice(g: Ground, shift: number, hours: number) {
  const a = Math.abs(shift);
  if (g.isHome) return 'Home base: keep your usual schedule and pay back any sleep debt with full home nights.';
  if (a < 2) return 'Small time difference: keep your usual schedule.';
  if (hours < 24) return 'Quick turn: do not adapt at all. Rest only inside your home night; keep any other nap short.';
  if (hours < 72) {
    return 'Keep home time: sleep during your home night (local times below) with blackout curtains, an eye mask and earplugs, even if it is daylight outside.';
  }
  return 'Long layover: holding home time fully is hard. Protect at least a 4 h anchor sleep inside your home night every day; letting the rest drift toward local time is acceptable.';
}

/**
 * Pick the in-flight break that best fits home time and place the longest
 * allowed sleep block inside it. Preference: home night, then the home
 * afternoon dip; a break in the rest of the home day only gets a power nap.
 */
function planFlight(f: ParsedFlight, p: Profile, homeTz: string, options: number[]): FlightPlan {
  const nights = nightsIn(homeTz, p.bedtime, p.wake, f.start - DAY, f.end + DAY);
  const dips = nights.map(n => ({ start: n.end + 6 * HOUR, end: n.end + 10 * HOUR }));

  // Place a block of `len` inside `usable`, maximising overlap with `targets`.
  const place = (usable: Iv, len: number, targets: Iv[]) => {
    const lo = usable.start;
    const hi = usable.end - len;
    const candidates = [lo, hi, ...targets.flatMap(t => [t.start, t.end - len])].filter(t => t >= lo && t <= hi);
    let sleep: Iv = { start: lo, end: lo + len };
    let best = -1;
    for (const t of candidates) {
      const c = { start: t, end: t + len };
      const o = overlapAll(c, targets);
      if (o > best) { best = o; sleep = c; }
    }
    return { sleep, overlapMin: best / MIN };
  };

  const breaks: BreakScore[] = f.breaks.map(b => {
    const iv = intersect({ start: f.start + b.afterMin * MIN, end: f.start + (b.afterMin + b.lengthMin) * MIN }, f)
      ?? { start: f.start, end: f.start };
    const usable = { start: iv.start + p.bunkSettleMin * MIN, end: iv.end };
    const availMin = (usable.end - usable.start) / MIN;
    const empty = { ...iv, homeNightMin: 0, dipMin: 0, blockMin: 0, sleep: null, fit: 'none' as const };
    let blockMin = largestFit(availMin, options);
    if (!blockMin) return empty;

    const inNight = place(usable, blockMin * MIN, nights);
    if (inNight.overlapMin > 0) return { ...iv, homeNightMin: inNight.overlapMin, dipMin: 0, blockMin, sleep: inNight.sleep, fit: 'night' as const };
    const inDip = place(usable, blockMin * MIN, dips);
    if (inDip.overlapMin > 0) return { ...iv, homeNightMin: 0, dipMin: inDip.overlapMin, blockMin, sleep: inDip.sleep, fit: 'dip' as const };
    blockMin = largestFit(Math.min(30, availMin), options);
    if (!blockMin) return empty;
    return { ...iv, homeNightMin: 0, dipMin: 0, blockMin, sleep: { start: usable.start, end: usable.start + blockMin * MIN }, fit: 'power' as const };
  });

  const rank = (b: BreakScore) => [b.homeNightMin, b.dipMin, b.blockMin];
  let best = -1;
  breaks.forEach((b, i) => {
    if (!b.sleep) return;
    if (best < 0) { best = i; return; }
    const [x, y] = [rank(b), rank(breaks[best])];
    for (let k = 0; k < x.length; k++) {
      if (Math.abs(x[k] - y[k]) > 1) { if (x[k] > y[k]) best = i; return; }
    }
  });
  const sleep = best >= 0 ? breaks[best].sleep : null;
  return { flight: f, breaks, best, item: sleep ? { ...sleep, kind: 'inflight' } : null };
}

function planGround(g: Ground, p: Profile, homeTz: string, options: number[], inflight: Iv[]): GroundPlan {
  const shift = (tzOffsetMin(g.tz, g.start) - tzOffsetMin(homeTz, g.start)) / 60;
  const hours = (g.end - g.start) / HOUR;
  const advice = groundAdvice(g, shift, hours);
  const window = { start: g.start + g.airport.toBedMin * MIN, end: g.end - g.airport.fromBedMin * MIN };
  if (window.end <= window.start) return { ground: g, shift, hours, window: null, items: [], advice };

  const nights = nightsIn(homeTz, p.bedtime, p.wake, window.start - DAY, window.end + DAY);
  const habitualMin = (hm(p.wake) - hm(p.bedtime) + 1440) % 1440;
  const targetMin = p.targetHours * 60;
  const items: PlanItem[] = [];
  const fullNight = new Set<number>();
  const planned = () => [...inflight, ...items.filter(i => SLEEP_KINDS.includes(i.kind))];

  for (const n of nights) {
    const i = intersect(n, window);
    if (!i) continue;
    const lenMin = (i.end - i.start) / MIN;
    if (lenMin >= Math.min(targetMin, habitualMin) * 0.75) {
      items.push({ ...i, kind: 'sleep' });
      fullNight.add(n.start);
      continue;
    }
    // Partial home night: end-aligned so you wake at home wake time (or when you must get up).
    const block = largestFit(lenMin, options);
    if (block) items.push({ start: i.end - block * MIN, end: i.end, kind: block >= 90 ? 'anchor' : 'nap' });
  }

  const clip = (iv: Iv, kind: PlanKind, minMin: number) => {
    const i = intersect(iv, window);
    if (i && i.end - i.start >= minMin * MIN) items.push({ ...i, kind });
  };

  nights.forEach((n, k) => {
    // Day following this night.
    clip({ start: n.end, end: n.end + 3 * HOUR }, 'light', 20);
    const next = nights[k + 1];
    if (!fullNight.has(n.start) && next) {
      // Top up in the home afternoon dip, finishing at least 4 h before home bedtime.
      const start = Math.max(n.end + 7 * HOUR, window.start);
      const latest = Math.min(next.start - 4 * HOUR, window.end);
      if (start < n.end + 9 * HOUR && latest > start) {
        const slept = overlapAll({ start: start - DAY, end: start }, planned()) / MIN;
        const block = largestFit(Math.min(targetMin - slept, (latest - start) / MIN), options);
        const nap = { start, end: start + block * MIN };
        if (block && overlapAll(nap, planned()) === 0) items.push({ ...nap, kind: 'nap' });
      }
    }
    // Evening before this night.
    clip({ start: n.start - 6 * HOUR, end: n.start - 2 * HOUR }, 'caffeine', 20);
    clip({ start: n.start - 2 * HOUR, end: n.start }, 'dim', 20);
  });

  items.sort((a, b) => a.start - b.start);
  return { ground: g, shift, hours, window, items, advice };
}

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

// ---------------------------------------------------------------------------
// Example data
// ---------------------------------------------------------------------------

function exampleProfile(): Profile {
  const home = 'America/Toronto';
  const today = utcToWall(Date.now(), home).slice(0, 10);
  const at = (d: number, t: string) => `${addDays(today, d)}T${t}`;
  const airports: Airport[] = [
    { code: 'YUL', tz: home, toBedMin: 75, fromBedMin: 150 },
    { code: 'CDG', tz: 'Europe/Paris', toBedMin: 105, fromBedMin: 150 },
    { code: 'NRT', tz: 'Asia/Tokyo', toBedMin: 150, fromBedMin: 180 },
  ];
  const flights: Flight[] = [
    { id: uid(), label: 'AC870', from: 'YUL', to: 'CDG', depart: at(-7, '21:30'), arrive: at(-6, '09:30'), breaks: [{ afterMin: 75, lengthMin: 120 }, { afterMin: 210, lengthMin: 120 }] },
    { id: uid(), label: 'AC871', from: 'CDG', to: 'YUL', depart: at(-4, '13:00'), arrive: at(-4, '14:45'), breaks: [{ afterMin: 90, lengthMin: 150 }, { afterMin: 270, lengthMin: 150 }] },
    { id: uid(), label: 'AC5', from: 'YUL', to: 'NRT', depart: at(2, '13:00'), arrive: at(3, '15:00'), breaks: [{ afterMin: 90, lengthMin: 240 }, { afterMin: 360, lengthMin: 240 }, { afterMin: 600, lengthMin: 120 }] },
    { id: uid(), label: 'AC6', from: 'NRT', to: 'YUL', depart: at(5, '11:00'), arrive: at(5, '10:30'), breaks: [{ afterMin: 90, lengthMin: 240 }, { afterMin: 360, lengthMin: 240 }] },
  ];
  const p: Profile = { ...newProfile(), homeTz: home, homeBase: 'YUL', airports, flights };
  const { grounds } = parseRotation(p, home);
  // [start day, home time, end day, home time, quality]
  const raw: [number, string, number, string, number][] = [
    [-10, '23:10', -9, '07:05', 4], [-9, '23:30', -8, '06:50', 4], [-8, '22:50', -7, '06:40', 3],
    [-6, '01:15', -6, '02:45', 2],
    [-6, '05:30', -6, '07:00', 2], [-6, '14:00', -6, '16:30', 3],
    [-6, '23:00', -5, '06:30', 4],
    [-5, '17:30', -5, '23:45', 2],
    [-4, '22:30', -3, '08:00', 3], [-3, '23:00', -2, '07:00', 4],
    [-2, '23:20', -1, '06:55', 4], [-1, '23:05', 0, '06:45', 5],
  ];
  p.sleeps = raw.map(([d0, t0, d1, t1, quality]) => {
    const start = wallToUtc(at(d0, t0), home);
    const end = wallToUtc(at(d1, t1), home);
    const tz = grounds.find(g => start >= g.start && start < g.end)?.tz ?? home;
    return { id: uid(), tz, start: utcToWall(start, tz), end: utcToWall(end, tz), quality, note: '' };
  });
  return p;
}

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
  <Box flex="1 1 160px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    {sub && <Text fontSize="2xs" color="var(--muted-text)">{sub}</Text>}
  </Box>
);

const TzInput: React.FC<{ value: string; onChange: (v: string) => void; size?: 'xs' | 'sm' }> = ({ value, onChange, size = 'sm' }) => (
  <Input
    size={size}
    list="crew-sleep-tz"
    value={value}
    onChange={e => onChange(e.target.value)}
    borderColor={validTz(value) ? undefined : 'red.400'}
    placeholder="Europe/Paris"
  />
);

/** Duration field accepting "90", "1h30", "1:30"; commits on blur / Enter. */
const DurInput: React.FC<{ value: number; onChange: (min: number) => void; w?: string; placeholder?: string; clearOnCommit?: boolean }> = ({ value, onChange, w = '80px', placeholder, clearOnCommit }) => {
  const shown = clearOnCommit ? '' : fmtDur(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const m = parseDur(text);
    if (Number.isFinite(m) && m >= 0) onChange(m);
    setText(shown);
  };
  return (
    <Input size="xs" w={w} value={text} placeholder={placeholder} onChange={e => setText(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
  );
};

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', fontSize: 11, color: 'var(--muted-text)', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '3px 6px', fontSize: 12, verticalAlign: 'middle' };

// ---------------------------------------------------------------------------
// Actogram: one row per evening, 12:00 -> 12:00 home time
// ---------------------------------------------------------------------------

interface ActoColors { sleep: string; homeNight: string; localNight: string; flight: string; grid: string; text: string; now: string }

const Actogram: React.FC<{
  homeTz: string;
  dates: string[];
  nights: Night[];
  localNights: (Iv & { place: string })[];
  grounds: Ground[];
  flights: ParsedFlight[];
  plans: PlanItem[];
  sleeps: ParsedSleep[];
  now: number;
  colors: ActoColors;
}> = ({ homeTz, dates, nights, localNights, grounds, flights, plans, sleeps, now, colors }) => {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 1000, LABEL = 120, ROW = 26, TOP = 22;
  const plotW = W - LABEL - 8;
  const H = TOP + dates.length * ROW + 4;

  const rows = useMemo(() => dates.map(d => ({
    date: d,
    start: wallToUtc(`${d}T12:00`, homeTz),
    end: wallToUtc(`${addDays(d, 1)}T12:00`, homeTz),
  })), [dates, homeTz]);

  const describe = (iv: Iv, tz: string) =>
    `local ${clock(iv.start, tz)}–${clock(iv.end, tz)} · home ${clock(iv.start, homeTz)}–${clock(iv.end, homeTz)} · ${fmtH((iv.end - iv.start) / HOUR)}`;

  const show = (e: React.MouseEvent, text: string) => setHover({ x: e.clientX, y: e.clientY, text });

  return (
    <Box position="relative" overflowX="auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640, display: 'block' }} onMouseLeave={() => setHover(null)}>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => {
          const x = LABEL + (h / 24) * plotW;
          return (
            <g key={h}>
              <line x1={x} x2={x} y1={TOP - 4} y2={H - 4} stroke={colors.grid} strokeWidth={1} />
              <text x={x} y={12} fontSize={10} textAnchor="middle" fill={colors.text}>{pad((h + 12) % 24)}:00</text>
            </g>
          );
        })}
        {rows.map((r, ri) => {
          const y = TOP + ri * ROW;
          const span = r.end - r.start;
          const xOf = (t: number) => LABEL + ((Math.min(Math.max(t, r.start), r.end) - r.start) / span) * plotW;
          const inRow = <T extends Iv>(list: T[]) => list.filter(iv => iv.end > r.start && iv.start < r.end);
          const places = inRow(grounds).filter(g => !g.isHome).map(g => g.code).join(' ');
          return (
            <g key={r.date}>
              <line x1={LABEL} x2={W - 8} y1={y + ROW} y2={y + ROW} stroke={colors.grid} strokeWidth={0.5} />
              <text x={4} y={y + 16} fontSize={10.5} fill={colors.text}>{dayLabel(r.start, homeTz)}</text>
              {places && <text x={LABEL - 6} y={y + 16} fontSize={9.5} textAnchor="end" fill={colors.text} fontWeight={600}>{places}</text>}
              {inRow(nights).map(n => (
                <rect key={n.start} x={xOf(n.start)} y={y + 1} width={xOf(n.end) - xOf(n.start)} height={ROW - 2} fill={colors.homeNight} />
              ))}
              {inRow(flights).map(f => (
                <rect key={`f${f.id}`} x={xOf(f.start)} y={y + 1} width={Math.max(2, xOf(f.end) - xOf(f.start))} height={4} rx={2} fill={colors.flight}
                  onMouseMove={e => show(e, `Flight ${f.label} ${f.from}→${f.to} · home ${clock(f.start, homeTz)}–${clock(f.end, homeTz)} · ${fmtH((f.end - f.start) / HOUR)}`)} />
              ))}
              {inRow(localNights).map(n => (
                <rect key={`l${n.start}`} x={xOf(n.start)} y={y + ROW - 5} width={xOf(n.end) - xOf(n.start)} height={4} rx={2} fill={colors.localNight}
                  onMouseMove={e => show(e, `Local night at ${n.place}`)} />
              ))}
              {inRow(plans).map(pl => (
                <rect key={`p${pl.start}`} x={xOf(pl.start) + 1} y={y + 7} width={Math.max(2, xOf(pl.end) - xOf(pl.start) - 2)} height={ROW - 14} rx={4}
                  fill="none" stroke={colors.sleep} strokeWidth={1.5} strokeDasharray="4 3"
                  onMouseMove={e => show(e, `Plan · ${KIND_META[pl.kind].label} · home ${clock(pl.start, homeTz)}–${clock(pl.end, homeTz)} · ${fmtDur((pl.end - pl.start) / MIN)}`)} />
              ))}
              {inRow(sleeps).map(s => (
                <rect key={`s${s.id}`} x={xOf(s.start)} y={y + 9} width={Math.max(2, xOf(s.end) - xOf(s.start))} height={ROW - 18} rx={4}
                  fill={colors.sleep}
                  onMouseMove={e => show(e, `Sleep · ${describe(s, s.tz)} · ${Math.round(s.homeOverlap * 100)}% in home night`)} />
              ))}
              {now >= r.start && now < r.end && (
                <line x1={xOf(now)} x2={xOf(now)} y1={y} y2={y + ROW} stroke={colors.now} strokeWidth={2} />
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <Box position="fixed" left={`${hover.x + 12}px`} top={`${hover.y + 12}px`} zIndex={20} pointerEvents="none"
          bg="var(--card-bg-raised)" border="1px solid" borderColor="var(--border-color)" borderRadius="md" px={2} py={1} fontSize="xs" boxShadow="md" maxW="320px">
          {hover.text}
        </Box>
      )}
    </Box>
  );
};

const PlanTable: React.FC<{ items: PlanItem[]; tz: string; homeTz: string }> = ({ items, tz, homeTz }) => (
  <Box overflowX="auto">
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr><th style={thStyle}>What</th><th style={thStyle}>Local</th><th style={thStyle}>Home</th><th style={thStyle}>Length</th></tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={`${it.kind}${it.start}`} style={{ borderTop: '1px solid var(--border-color)', fontWeight: SLEEP_KINDS.includes(it.kind) ? 600 : 400 }}>
            <td style={tdStyle}><HStack gap={2}>{KIND_META[it.kind].icon}<span>{KIND_META[it.kind].label}</span></HStack></td>
            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{dayLabel(it.start, tz)} {clock(it.start, tz)}–{clock(it.end, tz)}</td>
            <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--muted-text)' }}>{clock(it.start, homeTz)}–{clock(it.end, homeTz)}</td>
            <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--muted-text)' }}>{fmtDur((it.end - it.start) / MIN)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Box>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CrewSleep: React.FC = () => {
  const { profile: urlProfile } = useParams<{ profile?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const days = Number(searchParams.get('days')) || 14;

  const [p, setP] = useState<Profile>(newProfile);
  const [name, setName] = useState(urlProfile || '');
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);

  const colors: ActoColors = {
    sleep: useColorModeValue('#2a78d6', '#3987e5'),
    homeNight: useColorModeValue('rgba(74, 58, 167, 0.12)', 'rgba(144, 133, 233, 0.16)'),
    localNight: useColorModeValue('#eb6834', '#d95926'),
    flight: useColorModeValue('#8a8984', '#8f8e88'),
    grid: useColorModeValue('#e2e8f0', '#2d3748'),
    text: useColorModeValue('#52514e', '#c3c2b7'),
    now: useColorModeValue('#e34948', '#e66767'),
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const update = useCallback((fn: (prev: Profile) => Profile) => {
    dirty.current = true;
    setP(fn);
  }, []);
  const set = useCallback(<K extends keyof Profile>(key: K, val: Profile[K]) => update(prev => ({ ...prev, [key]: val })), [update]);

  const loadNames = useCallback(async () => {
    try { setSavedNames(await privateJsonStore.list(COLLECTION)); } catch { /* empty */ }
  }, []);
  useEffect(() => { loadNames(); }, [loadNames]);

  useEffect(() => {
    if (!urlProfile) return;
    privateJsonStore.get<Profile>(COLLECTION, urlProfile)
      .then(data => { dirty.current = false; setP({ ...newProfile(), ...data }); setName(urlProfile); setStatus('idle'); })
      .catch(() => {});
  }, [urlProfile]);

  // A tracker should not lose entries: autosave once the profile has a name.
  useEffect(() => {
    if (!urlProfile || !dirty.current) return;
    setStatus('saving');
    const id = setTimeout(() => {
      privateJsonStore.put(COLLECTION, urlProfile, p)
        .then(() => { dirty.current = false; setStatus('saved'); })
        .catch(() => setStatus('error'));
    }, 800);
    return () => clearTimeout(id);
  }, [p, urlProfile]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await privateJsonStore.put(COLLECTION, n, p);
      dirty.current = false;
      setStatus('saved');
    } catch { setStatus('error'); return; }
    await loadNames();
    navigate(`${BASE}/${encodeURIComponent(n)}${window.location.search}`, { replace: true });
  };

  const handleDelete = async () => {
    const n = name.trim();
    if (!n || !window.confirm(`Delete "${n}"?`)) return;
    await privateJsonStore.remove(COLLECTION, n);
    dirty.current = false;
    setName('');
    setP(newProfile());
    await loadNames();
    navigate(BASE, { replace: true });
  };

  // ---- derived -----------------------------------------------------------

  const homeTz = validTz(p.homeTz) ? p.homeTz : 'UTC';
  const options = useMemo(() => Array.from(new Set(p.napOptionsMin.filter(m => m > 0))).sort((a, b) => a - b), [p.napOptionsMin]);

  const rotation = useMemo(() => parseRotation(p, homeTz), [p, homeTz]);
  const { flights, grounds, gaps, tzOf, apOf } = rotation;

  const flightPlans = useMemo(() => flights.map(f => planFlight(f, p, homeTz, options)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flights, homeTz, options, p.bedtime, p.wake, p.bunkSettleMin]);

  const groundPlans = useMemo(() => {
    const inflight = flightPlans.flatMap(fp => (fp.item ? [fp.item] : []));
    return grounds.map(g => planGround(g, p, homeTz, options, inflight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grounds, flightPlans, homeTz, options, p.bedtime, p.wake, p.targetHours]);

  /** Where you are at `t`: a ground period, a flight, or home. */
  const whereAt = useCallback((t: number) => {
    const g = grounds.find(x => t >= x.start && t < x.end);
    if (g) return { tz: g.tz, label: g.isHome ? `${g.code} (home base)` : g.code, flight: null as ParsedFlight | null };
    const f = flights.find(x => t >= x.start && t < x.end);
    if (f) return { tz: homeTz, label: `In flight ${f.label} ${f.from}→${f.to}`, flight: f };
    return { tz: homeTz, label: 'Home', flight: null };
  }, [grounds, flights, homeTz]);

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

  // Rows: the last `days` evenings, plus the upcoming rotation (capped at 3 weeks ahead).
  const range = useMemo(() => {
    const last = flights.length ? flights[flights.length - 1].end : now;
    const to = Math.min(Math.max(now, last) + DAY, now + 21 * DAY);
    return { start: now - days * DAY, end: to };
  }, [flights, now, days]);

  const rowDate = useCallback((t: number) => {
    const w = utcToWall(t, homeTz);
    return Number(w.slice(11, 13)) < 12 ? addDays(w.slice(0, 10), -1) : w.slice(0, 10);
  }, [homeTz]);

  const dates = useMemo(() => {
    const out: string[] = [];
    const last = rowDate(range.end);
    for (let d = rowDate(range.start); d <= last && out.length < 120; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range, rowDate]);

  const homeNights = useMemo(() => nightsIn(homeTz, p.bedtime, p.wake, range.start - DAY, range.end + DAY),
    [homeTz, p.bedtime, p.wake, range]);

  const localNights = useMemo(() => grounds.filter(g => !g.isHome).flatMap(g =>
    nightsIn(g.tz, p.bedtime, p.wake, g.start, g.end)
      .map(n => intersect(n, g))
      .filter((n): n is Iv => !!n)
      .map(n => ({ ...n, place: g.code }))), [grounds, p.bedtime, p.wake]);

  const planSleeps = useMemo(() => [
    ...flightPlans.flatMap(fp => (fp.item ? [fp.item] : [])),
    ...groundPlans.flatMap(gp => gp.items.filter(i => SLEEP_KINDS.includes(i.kind))),
  ].sort((a, b) => a.start - b.start), [flightPlans, groundPlans]);

  const stats = useMemo(() => {
    const week = { start: now - 7 * DAY, end: now };
    const weekHours = overlapAll(week, sleeps) / HOUR;
    const inRange = sleeps.filter(s => s.end > range.start && s.start < now);
    const total = inRange.reduce((acc, s) => acc + s.hours, 0);
    const aligned = inRange.reduce((acc, s) => acc + s.hours * s.homeOverlap, 0);
    const main = inRange.filter(s => s.hours >= 3);
    const drift = main.length ? main.reduce((acc, s) => acc + Math.abs(s.drift), 0) / main.length : 0;
    return {
      avg: weekHours / 7,
      debt: Math.max(0, p.targetHours * 7 - weekHours),
      alignment: total ? aligned / total : 0,
      drift,
      count: inRange.length,
    };
  }, [sleeps, now, range, p.targetHours]);

  const dailySpec = useMemo(() => {
    const byDate = new Map<string, number>(dates.map(d => [d, 0]));
    for (const s of sleeps) {
      const d = rowDate((s.start + s.end) / 2);
      if (byDate.has(d)) byDate.set(d, (byDate.get(d) || 0) + s.hours);
    }
    const values = Array.from(byDate.entries())
      .filter(([d]) => wallToUtc(`${d}T12:00`, homeTz) <= now)
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 200,
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
  }, [dates, sleeps, rowDate, homeTz, now, p.targetHours, colors.sleep, colors.text]);

  const driftSpec = useMemo(() => {
    const values = sleeps
      .filter(s => s.hours >= 3 && s.end > range.start && s.start < now)
      .map(s => ({ date: rowDate((s.start + s.end) / 2), drift: Math.round(s.drift * 100) / 100, where: s.tz }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 200,
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
  }, [sleeps, range, now, rowDate, colors.sleep]);

  // ---- now card ----------------------------------------------------------

  const here = whereAt(now);
  const phase = homePhase(p, homeTz, now);
  const nextNight = nightsIn(homeTz, p.bedtime, p.wake, now - DAY, now + 2 * DAY).find(n => n.end > now);
  const nextPlanned = planSleeps.find(i => i.end > now);
  const nextWhere = nextPlanned ? whereAt(nextPlanned.start) : null;

  // ---- editing -----------------------------------------------------------

  const ensureAirport = (code: string) => update(prev => (
    !code || prev.airports.some(a => a.code.toUpperCase() === code.toUpperCase())
      ? prev
      : { ...prev, airports: [...prev.airports, newAirport(code.toUpperCase(), homeTz)] }
  ));
  const editAirport = (code: string, patch: Partial<Airport>) =>
    update(prev => ({ ...prev, airports: prev.airports.map(a => (a.code === code ? { ...a, ...patch } : a)) }));
  const removeAirport = (code: string) => update(prev => ({ ...prev, airports: prev.airports.filter(a => a.code !== code) }));

  const addFlight = () => {
    const last = flights[flights.length - 1];
    const from = last ? last.to : (p.homeBase || '');
    const fromTz = tzOf(from);
    const start = last ? last.end + 2 * DAY : now + DAY;
    update(prev => ({
      ...prev,
      flights: [...prev.flights, {
        id: uid(), label: '', from, to: last ? last.from : '',
        depart: utcToWall(start, fromTz).slice(0, 11) + '12:00',
        arrive: utcToWall(start + 8 * HOUR, fromTz).slice(0, 11) + '20:00',
        breaks: [],
      }],
    }));
  };
  const editFlight = (id: string, patch: Partial<Flight>) =>
    update(prev => ({ ...prev, flights: prev.flights.map(f => (f.id === id ? { ...f, ...patch } : f)) }));
  const removeFlight = (id: string) => update(prev => ({ ...prev, flights: prev.flights.filter(f => f.id !== id) }));
  const editBreak = (f: Flight, i: number, patch: Partial<RestBreak>) =>
    editFlight(f.id, { breaks: f.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

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

  const startSleep = () => set('pendingStart', Date.now());
  const endSleep = () => {
    if (p.pendingStart && Date.now() > p.pendingStart) addSleep(p.pendingStart, Date.now());
  };

  const isOpen = (id: string, i: number) => {
    if (id in expanded) return expanded[id];
    return i === groundPlans.findIndex(x => x.ground.end > now);
  };

  const setDays = (d: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('days', String(d));
    setSearchParams(next, { replace: true });
  };

  const flightPlanById = new Map(flightPlans.map(fp => [fp.flight.id, fp]));
  const sleepById = new Map(sleeps.map(s => [s.id, s]));
  const knownCodes = new Set(p.airports.map(a => a.code.toUpperCase()));
  const missingCodes = Array.from(new Set(p.flights.flatMap(f => [f.from, f.to]).map(c => c.toUpperCase()).filter(c => c && !knownCodes.has(c))));

  return (
    <VStack align="stretch" gap={5} p={{ base: 2, md: 4 }} maxW="1200px" mx="auto">
      <datalist id="crew-sleep-tz">
        {ALL_TZ.map(tz => <option key={tz} value={tz} />)}
      </datalist>
      <datalist id="crew-sleep-ap">
        {p.airports.map(a => <option key={a.code} value={a.code} />)}
      </datalist>

      <Box>
        <Heading size="lg" color="var(--heading-color)">Crew Sleep</Heading>
        <Text fontSize="sm" color="var(--muted-text)">
          Track sleep across time zones while holding your home clock. Short layovers are easier on
          the body if you never adapt: sleep in your home night wherever you are, in sleep-cycle sized blocks.
        </Text>
      </Box>

      {/* Profiles */}
      <HStack gap={2} flexWrap="wrap">
        <Input size="sm" maxW="220px" placeholder="Profile name" value={name} onChange={e => setName(e.target.value)} />
        <Button size="sm" onClick={handleSave} disabled={!name.trim()}><Save size={14} /> Save</Button>
        <Button size="sm" variant="outline" onClick={handleDelete} disabled={!urlProfile}><Trash2 size={14} /> Delete</Button>
        <Button size="sm" variant="ghost" onClick={() => { update(() => exampleProfile()); }}><Sparkles size={14} /> Load example</Button>
        {urlProfile && (
          <Text fontSize="xs" color={status === 'error' ? 'var(--panel-red-text, #ef4444)' : 'var(--muted-text)'}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : ''}
          </Text>
        )}
        {savedNames.map(s => (
          <Button key={s} size="xs" variant="outline" colorPalette={s === urlProfile ? 'blue' : undefined}
            onClick={() => navigate(`${BASE}/${encodeURIComponent(s)}${window.location.search}`)}>
            <FolderOpen size={12} /> {s}
          </Button>
        ))}
      </HStack>

      {/* Now + settings */}
      <Flex gap={4} flexWrap="wrap">
        <Card flex="2 1 340px" title={<HStack gap={2}>{phase.icon}<span>Right now: {phase.label}</span></HStack>}>
          <Flex gap={6} flexWrap="wrap" mb={3}>
            <Box>
              <Text fontSize="xs" color="var(--muted-text)">Home ({homeTz})</Text>
              <Text fontSize="2xl" fontWeight="bold">{clock(now, homeTz)}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="var(--muted-text)">Here: {here.label}</Text>
              <Text fontSize="2xl" fontWeight="bold">{clock(now, here.tz)}</Text>
            </Box>
          </Flex>
          <Text fontSize="sm" mb={2}>{phase.tip}</Text>
          {nextNight && (
            <Text fontSize="sm" color="var(--muted-text)">
              {nextNight.start <= now ? 'Home night ends' : 'Next home bedtime'}:{' '}
              <b>{clock(nextNight.start <= now ? nextNight.end : nextNight.start, here.tz)}</b> local
              {' '}({clock(nextNight.start <= now ? nextNight.end : nextNight.start, homeTz)} home)
            </Text>
          )}
          {nextPlanned && nextWhere && (
            <Text fontSize="sm" color="var(--muted-text)">
              Next planned sleep ({KIND_META[nextPlanned.kind].label.split(':')[0].toLowerCase()}, {nextWhere.label}):{' '}
              <b>{dayLabel(nextPlanned.start, nextWhere.tz)} {clock(nextPlanned.start, nextWhere.tz)}–{clock(nextPlanned.end, nextWhere.tz)}</b>
              {nextWhere.flight ? ' home time' : ' local'} · {fmtDur((nextPlanned.end - nextPlanned.start) / MIN)}
            </Text>
          )}
          <HStack mt={4} gap={2} flexWrap="wrap">
            {p.pendingStart ? (
              <>
                <Button size="sm" colorPalette="blue" onClick={endSleep}><Sun size={14} /> I woke up</Button>
                <Text fontSize="xs" color="var(--muted-text)">
                  Asleep since {clock(p.pendingStart, whereAt(p.pendingStart).tz)} local ({fmtH((now - p.pendingStart) / HOUR)})
                </Text>
                <Button size="xs" variant="ghost" onClick={() => set('pendingStart', null)}>Cancel</Button>
              </>
            ) : (
              <Button size="sm" colorPalette="blue" onClick={startSleep}><BedDouble size={14} /> Going to sleep</Button>
            )}
          </HStack>
        </Card>

        <Card flex="1 1 300px" title="Home clock">
          <VStack align="stretch" gap={3}>
            <HStack gap={3} align="flex-start">
              <Box flex="1"><Labeled label="Home time zone"><TzInput value={p.homeTz} onChange={v => set('homeTz', v)} /></Labeled></Box>
              <Box w="80px"><Labeled label="Home base"><Input size="sm" list="crew-sleep-ap" value={p.homeBase} placeholder="YUL"
                onChange={e => set('homeBase', e.target.value.toUpperCase())} /></Labeled></Box>
            </HStack>
            <HStack gap={3}>
              <Labeled label="Usual bedtime"><Input size="sm" type="time" value={p.bedtime} onChange={e => set('bedtime', e.target.value)} /></Labeled>
              <Labeled label="Usual wake"><Input size="sm" type="time" value={p.wake} onChange={e => set('wake', e.target.value)} /></Labeled>
              <Labeled label="Sleep need (h)"><Input size="sm" type="number" step={0.5} value={p.targetHours} onChange={e => set('targetHours', Number(e.target.value))} /></Labeled>
            </HStack>
            <Labeled label="Sleep blocks (naps snap to the longest one that fits)">
              <HStack gap={1} flexWrap="wrap">
                {options.map(m => (
                  <HStack key={m} gap={1} px={2} py={0.5} borderRadius="full" border="1px solid" borderColor="var(--border-color)" fontSize="xs">
                    <span>{fmtDur(m)}</span>
                    <Box as="button" aria-label={`Remove ${fmtDur(m)}`} onClick={() => set('napOptionsMin', options.filter(o => o !== m))} display="flex">
                      <X size={10} />
                    </Box>
                  </HStack>
                ))}
                <DurInput value={0} clearOnCommit placeholder="+ 1h30" onChange={m => { if (m > 0) set('napOptionsMin', [...options, m]); }} />
                <Button size="xs" variant="ghost" onClick={() => set('napOptionsMin', DEFAULT_NAP_OPTIONS)}>Reset</Button>
              </HStack>
            </Labeled>
            <HStack gap={2}>
              <Text fontSize="xs" fontWeight="bold">Time to fall asleep in the bunk</Text>
              <DurInput value={p.bunkSettleMin} onChange={m => set('bunkSettleMin', m)} />
            </HStack>
            <Text fontSize="2xs" color="var(--muted-text)">
              30 min is a power nap; beyond that, multiples of a 90 min sleep cycle let you wake between cycles instead of in deep sleep.
            </Text>
          </VStack>
        </Card>
      </Flex>

      {/* Stats */}
      <Flex gap={4} flexWrap="wrap">
        <StatTile label="Average sleep (last 7 days)" value={fmtH(stats.avg)} sub={`target ${fmtH(p.targetHours)} per day`} />
        <StatTile label="Sleep debt (last 7 days)" value={fmtH(stats.debt)} sub="vs. your sleep need" />
        <StatTile label="Slept inside home night" value={`${Math.round(stats.alignment * 100)}%`} sub={`${stats.count} sleeps in view`} />
        <StatTile label="Average main-sleep drift" value={fmtH(stats.drift)} sub="from your usual home night" />
      </Flex>

      {/* Actogram */}
      <Card title={
        <Flex justify="space-between" align="center" gap={2} flexWrap="wrap">
          <span>Sleep timeline (home time, noon to noon)</span>
          <HStack gap={1}>
            {[7, 14, 30, 90].map(d => (
              <Button key={d} size="xs" variant={d === days ? 'solid' : 'outline'} onClick={() => setDays(d)}>{d}d</Button>
            ))}
          </HStack>
        </Flex>
      }>
        <HStack gap={4} mb={2} flexWrap="wrap" fontSize="xs" color="var(--muted-text)">
          <HStack gap={1}><Box w="14px" h="8px" borderRadius="2px" bg={colors.sleep} /> <span>Sleep</span></HStack>
          <HStack gap={1}><Box w="14px" h="8px" borderRadius="2px" border="1.5px dashed" borderColor={colors.sleep} /> <span>Recommended</span></HStack>
          <HStack gap={1}><Box w="14px" h="10px" bg={colors.homeNight} /> <span>Usual home night</span></HStack>
          <HStack gap={1}><Box w="14px" h="4px" borderRadius="2px" bg={colors.flight} /> <span>Flight</span></HStack>
          <HStack gap={1}><Box w="14px" h="4px" borderRadius="2px" bg={colors.localNight} /> <span>Local night on layover</span></HStack>
          <HStack gap={1}><Box w="2px" h="10px" bg={colors.now} /> <span>Now</span></HStack>
        </HStack>
        <Actogram homeTz={homeTz} dates={dates} nights={homeNights} localNights={localNights} grounds={grounds}
          flights={flights} plans={planSleeps} sleeps={sleeps} now={now} colors={colors} />
      </Card>

      {/* Airports */}
      <Card title={<HStack gap={2}><MapPin size={16} /><span>Airports</span></HStack>}>
        <Text fontSize="xs" color="var(--muted-text)" mb={3}>
          Per airport: how long from block-in until you are in bed (deplane, commute, shower, prepare), and how long from
          getting up until departure (prepare, commute, report). Accepts 90, 1h30 or 1:30.
        </Text>
        <Box overflowX="auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={thStyle}>Code</th><th style={thStyle}>Time zone</th><th style={thStyle}>Block-in → in bed</th>
                <th style={thStyle}>Out of bed → departure</th><th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {p.airports.map(a => (
                <tr key={a.code} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{a.code}{a.code === p.homeBase ? ' (home)' : ''}</td>
                  <td style={{ ...tdStyle, minWidth: 180 }}><TzInput size="xs" value={a.tz} onChange={v => editAirport(a.code, { tz: v })} /></td>
                  <td style={tdStyle}><DurInput value={a.toBedMin} onChange={m => editAirport(a.code, { toBedMin: m })} /></td>
                  <td style={tdStyle}><DurInput value={a.fromBedMin} onChange={m => editAirport(a.code, { fromBedMin: m })} /></td>
                  <td style={tdStyle}><Button size="xs" variant="ghost" aria-label={`Remove ${a.code}`} onClick={() => removeAirport(a.code)}><Trash2 size={12} /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <HStack mt={3} gap={2} flexWrap="wrap">
          {missingCodes.map(c => (
            <Button key={c} size="xs" variant="outline" colorPalette="orange" onClick={() => ensureAirport(c)}>
              <Plus size={12} /> Add {c}{KNOWN_AIRPORTS[c] ? ` (${KNOWN_AIRPORTS[c]})` : ''}
            </Button>
          ))}
          <Input size="xs" w="110px" placeholder="Add code…" onKeyDown={e => {
            if (e.key === 'Enter') { ensureAirport((e.target as HTMLInputElement).value.trim()); (e.target as HTMLInputElement).value = ''; }
          }} />
        </HStack>
      </Card>

      {/* Flights */}
      <Card title={<HStack gap={2}><Plane size={16} /><span>Flights & in-flight rest</span></HStack>}>
        <Text fontSize="xs" color="var(--muted-text)" mb={3}>
          Departure is local at the origin, arrival local at the destination. Add the crew rest breaks offered on the
          flight; the one covering the most of your home night is recommended.
        </Text>
        <VStack align="stretch" gap={3}>
          {p.flights.length === 0 && <Text fontSize="sm" color="var(--muted-text)">No flights yet.</Text>}
          {[...p.flights].sort((a, b) => (flightPlanById.get(a.id)?.flight.start ?? 0) - (flightPlanById.get(b.id)?.flight.start ?? 0)).map(f => {
            const fp = flightPlanById.get(f.id);
            const past = fp ? fp.flight.end < now : false;
            return (
              <Box key={f.id} border="1px solid" borderColor="var(--border-color)" borderRadius="md" p={3} opacity={past ? 0.75 : 1}>
                <Flex gap={2} flexWrap="wrap" align="flex-end">
                  <Box w="80px"><Labeled label="Flight"><Input size="sm" value={f.label} placeholder="AC870" onChange={e => editFlight(f.id, { label: e.target.value })} /></Labeled></Box>
                  <Box w="70px"><Labeled label="From"><Input size="sm" list="crew-sleep-ap" value={f.from} onChange={e => editFlight(f.id, { from: e.target.value.toUpperCase() })} /></Labeled></Box>
                  <Box w="70px"><Labeled label="To"><Input size="sm" list="crew-sleep-ap" value={f.to} onChange={e => editFlight(f.id, { to: e.target.value.toUpperCase() })} /></Labeled></Box>
                  <Box flex="1 1 190px"><Labeled label={`Depart (${f.from || 'local'})`}><Input size="sm" type="datetime-local" value={f.depart} onChange={e => editFlight(f.id, { depart: e.target.value })} /></Labeled></Box>
                  <Box flex="1 1 190px"><Labeled label={`Arrive (${f.to || 'local'})`}><Input size="sm" type="datetime-local" value={f.arrive} onChange={e => editFlight(f.id, { arrive: e.target.value })} /></Labeled></Box>
                  <Button size="sm" variant="ghost" aria-label="Remove flight" onClick={() => removeFlight(f.id)}><Trash2 size={14} /></Button>
                </Flex>
                {!fp ? (
                  <Text fontSize="xs" mt={2} color="var(--panel-red-text, #ef4444)">Arrival must be after departure (check the airport time zones).</Text>
                ) : (
                  <Box mt={2}>
                    <Text fontSize="xs" color="var(--muted-text)" mb={1}>
                      Block {fmtH((fp.flight.end - fp.flight.start) / HOUR)} · home {clock(fp.flight.start, homeTz)} → {clock(fp.flight.end, homeTz)}
                    </Text>
                    <Box overflowX="auto">
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                        <tbody>
                          {f.breaks.map((b, i) => {
                            const s = fp.breaks[i];
                            const best = i === fp.best;
                            return (
                              <tr key={i} style={{ borderTop: '1px solid var(--border-color)', fontWeight: best ? 600 : 400 }}>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>Break {i + 1}</td>
                                <td style={tdStyle}><HStack gap={1}><Text fontSize="xs">after</Text><DurInput value={b.afterMin} onChange={m => editBreak(f, i, { afterMin: m })} w="70px" /></HStack></td>
                                <td style={tdStyle}><HStack gap={1}><Text fontSize="xs">for</Text><DurInput value={b.lengthMin} onChange={m => editBreak(f, i, { lengthMin: m })} w="70px" /></HStack></td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--muted-text)' }}>home {clock(s.start, homeTz)}–{clock(s.end, homeTz)}</td>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                  {s.sleep
                                    ? <>{best && <Plane size={12} style={{ display: 'inline', marginRight: 4 }} />}sleep {fmtDur(s.blockMin)} {clock(s.sleep.start, homeTz)}–{clock(s.sleep.end, homeTz)} home · {s.fit === 'night' ? `${fmtDur(s.homeNightMin)} in home night` : s.fit === 'dip' ? 'home afternoon dip' : 'home daytime: power nap only'}{best ? ' · recommended' : ''}</>
                                    : <span style={{ color: 'var(--muted-text)' }}>too short to sleep</span>}
                                </td>
                                <td style={tdStyle}>
                                  <Button size="xs" variant="ghost" aria-label="Remove break" onClick={() => editFlight(f.id, { breaks: f.breaks.filter((_, j) => j !== i) })}><X size={12} /></Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Box>
                    <Button size="xs" variant="ghost" mt={1} onClick={() => editFlight(f.id, { breaks: [...f.breaks, { afterMin: 60, lengthMin: 120 }] })}>
                      <Plus size={12} /> Add rest break
                    </Button>
                  </Box>
                )}
              </Box>
            );
          })}
          <Box><Button size="sm" variant="outline" onClick={addFlight}><Plus size={14} /> Add flight</Button></Box>
        </VStack>
      </Card>

      {/* Layovers */}
      <Card title={<HStack gap={2}><BedDouble size={16} /><span>Layovers & recommendations</span></HStack>}>
        <Text fontSize="xs" color="var(--muted-text)" mb={3}>
          Derived from consecutive flights. Bed time is trimmed by each airport's commute and preparation times.
        </Text>
        <VStack align="stretch" gap={3}>
          {gaps.map(g => <Text key={g} fontSize="xs" color="var(--panel-red-text, #ef4444)">{g}</Text>)}
          {groundPlans.length === 0 && <Text fontSize="sm" color="var(--muted-text)">Add at least two consecutive flights to see a layover.</Text>}
          {groundPlans.map((gp, idx) => {
            const g = gp.ground;
            const open = isOpen(g.id, idx);
            const n = nightsIn(homeTz, p.bedtime, p.wake, g.start, g.end)[0];
            return (
              <Box key={g.id} border="1px solid" borderColor="var(--border-color)" borderRadius="md" p={3} opacity={g.end < now ? 0.75 : 1}>
                <HStack gap={3} flexWrap="wrap" cursor="pointer" onClick={() => setExpanded(prev => ({ ...prev, [g.id]: !open }))}>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Text fontSize="sm" fontWeight="bold">{g.code}{g.isHome ? ' (home base)' : ''}</Text>
                  <Text fontSize="sm">{fmtShift(gp.shift)} from home</Text>
                  <Text fontSize="sm" color="var(--muted-text)">
                    {dayLabel(g.start, g.tz)} {clock(g.start, g.tz)} → {dayLabel(g.end, g.tz)} {clock(g.end, g.tz)} local · {fmtH(gp.hours)} on the ground
                  </Text>
                  {gp.window && (
                    <Text fontSize="sm" color="var(--muted-text)">
                      bed from {clock(gp.window.start, g.tz)}, up by {clock(gp.window.end, g.tz)}
                    </Text>
                  )}
                  {n && !g.isHome && (
                    <Text fontSize="sm" color="var(--muted-text)">home night here: {clock(n.start, g.tz)}–{clock(n.end, g.tz)}</Text>
                  )}
                </HStack>
                {open && (
                  <Box mt={2} pl={6}>
                    <Text fontSize="sm" mb={2}>{gp.advice}</Text>
                    {gp.items.length === 0
                      ? <Text fontSize="sm" color="var(--muted-text)">No time in bed once commute and preparation are taken out.</Text>
                      : <PlanTable items={gp.items} tz={g.tz} homeTz={homeTz} />}
                  </Box>
                )}
              </Box>
            );
          })}
        </VStack>
      </Card>

      {/* Charts */}
      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={dailySpec} height="260px" /></VegaProvider>
        </Box>
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={driftSpec} height="260px" /></VegaProvider>
        </Box>
      </Flex>

      {/* Sleep log */}
      <Card title={<HStack gap={2}><BedDouble size={16} /><span>Sleep log</span></HStack>}>
        <Text fontSize="xs" color="var(--muted-text)" mb={3}>
          Times are local to where you slept (home time for sleep in flight). The time zone is filled in from your rotation.
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
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{s ? fmtH(s.hours) : <span style={{ color: 'var(--panel-red-text, #ef4444)' }}>invalid</span>}</td>
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
      </Card>

      {/* Rationale */}
      <Card title="Why hold home time">
        <VStack align="stretch" gap={2} fontSize="sm">
          <Text>
            Your body clock shifts about one hour per day at best. On layovers shorter than ~3 days,
            adapting to local time means flying home just as you adjust, then shifting back:
            two jet lags per trip. Staying on home time avoids both.
          </Text>
          <Text>
            <b>Light</b> moves the clock the most. Bright light in your home morning keeps it in place;
            light during your home late evening and night pushes it toward local time, so dim it or wear sunglasses.
          </Text>
          <Text>
            <b>Anchor sleep</b>: when the full home night is not possible, keeping a block of sleep inside
            the same home-night window every day stabilises the rhythm. Make up the rest with a nap
            in the early home afternoon, when you naturally dip, or in the crew bunk.
          </Text>
          <Text>
            <b>Sleep blocks</b>: waking from deep sleep leaves you groggy (sleep inertia). A 30 min power nap stays in
            light sleep; longer blocks are whole 90 min cycles so you wake between cycles.
          </Text>
          <Text color="var(--muted-text)" fontSize="xs">
            Rules of thumb only. Fatigue-risk rules and medical advice (e.g. melatonin) come first.
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
};

export default CrewSleep;
