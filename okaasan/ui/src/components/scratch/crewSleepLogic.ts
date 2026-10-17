// Crew Sleep: model, time zone helpers and planning rules (no React).
//
// All user-entered times are wall-clock strings ("YYYY-MM-DDTHH:mm") in the
// time zone of the place they happened, which is how crew think about them.
// They are converted to UTC milliseconds for every computation.
//
// The rotation is a list of flights. Ground periods are derived from
// consecutive flights (arrive at X, next departure from X), plus a stretch at
// home base before the first and after the last flight. A trip is a run of
// flights that leaves a base and comes back to one.

import { TRINITY_AIRPORTS, TRINITY_ROUTES } from './crewSleepNetwork';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface Airport {
  code: string;
  city?: string;
  tz: string;
  toBedMin: number;    // block-in -> in bed: deplane, commute, shower, prepare
  fromBedMin: number;  // out of bed -> departure: prepare, commute, report
}

/** One direction of a route; departTime and flightNo are learned from the flights she enters. */
export interface Route {
  from: string;
  to: string;
  blockMin: number;
  departTime?: string; // usual local departure, HH:mm
  flightNo?: string;
}

export interface RestBreak {
  afterMin: number;    // starts this long after departure
  lengthMin: number;
}

export interface Flight {
  id: string;
  label: string;
  from: string;        // airport code
  to: string;
  depart: string;      // local wall time at `from`
  arrive: string;      // local wall time at `to`
  breaks: RestBreak[]; // in-flight crew rest options
}

export interface SleepEntry {
  id: string;
  tz: string;
  start: string;    // wall time in tz
  end: string;      // wall time in tz
  quality: number;  // 1..5
  note: string;
}

export interface Profile {
  homeTz: string;
  homeBase: string;        // airport code(s), e.g. "ICN GMP"
  bedtime: string;         // home clock, HH:mm
  wake: string;            // home clock, HH:mm
  targetHours: number;
  napOptionsMin: number[]; // allowed sleep block lengths (sleep-cycle aligned)
  bunkSettleMin: number;   // time to fall asleep in the crew bunk
  maxBunkRestMin: number;  // longest sleep cabin duties allow on board
  serviceAfterTakeoffMin: number;  // meal service after takeoff: no rest
  serviceBeforeLandingMin: number; // meal service before landing: no rest
  sleepBankMin: number;    // extra sleep the night before a short night
  strategicNap: boolean;   // short nap in the crew lounge before a night flight or long duty
  strategicNapMin: number;
  melatonin: boolean;      // reminder before layover sleeps in the home night (off unless prescribed)
  melatoninLeadMin: number;
  anchorCoreMin: number;   // core of the home night to keep asleep every day (1h30 minimum, 3h best)
  // Duty & rest rules (set to your airline's flight time limitations)
  reportMin: number;       // sign-on before departure
  debriefMin: number;      // sign-off after block-in
  restHomeMin: number;     // minimum rest at home base
  restAwayMin: number;     // minimum rest away from base
  restAtLeastDuty: boolean; // rest must also be >= the preceding duty
  airports: Airport[];
  routes: Route[];
  flights: Flight[];
  sleeps: SleepEntry[];
  pendingStart: number | null; // UTC ms of "going to sleep" tap
}

export interface Iv { start: number; end: number }
export interface Night extends Iv { date: string }
export type ParsedFlight = Flight & Iv;
export type ParsedSleep = Omit<SleepEntry, 'start' | 'end'> & Iv & { hours: number; homeOverlap: number; drift: number };

export interface Ground extends Iv {
  id: string;
  code: string;
  tz: string;
  airport: Airport;
  departAirport?: Airport;        // when you leave from another base than you landed at
  isHome: boolean;
  inbound: ParsedFlight | null;   // null: before the first flight
  outbound: ParsedFlight | null;  // null: after the last flight
}

export type PlanKind = 'sleep' | 'anchor' | 'nap' | 'inflight' | 'strategic' | 'light' | 'dim' | 'caffeine' | 'melatonin';
export interface PlanItem extends Iv {
  kind: PlanKind;
  bankedMin?: number; // extra sleep added because the next night is short
  recovery?: boolean; // catch-up sleep right after a missed night
}

export interface GroundPlan {
  ground: Ground;
  shift: number;
  hours: number;
  window: Iv | null;
  items: PlanItem[];
  advice: string;
}

export interface BreakScore extends Iv {
  coreMin: number;      // minutes of the anchor core covered
  homeNightMin: number;
  dipMin: number;
  blockMin: number;
  sleep: Iv | null;
  fit: 'night' | 'dip' | 'power' | 'none';
}

export interface FlightPlan {
  flight: ParsedFlight;
  breaks: BreakScore[];
  best: number;          // index into breaks, -1 if none usable
  item: PlanItem | null;
}

export interface RestInfo {
  turn: boolean;
  dutyMin: number;        // preceding duty: first report -> sign-off
  restMin: number;        // sign-off -> next report
  requiredMin: number;
  ok: boolean;
  earliestDepart: number; // earliest legal block-out of the next flight
}

export interface Trip extends Iv {
  id: string;
  flights: ParsedFlight[];
  stops: string[];        // airports visited away from base
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const SLEEP_KINDS: PlanKind[] = ['sleep', 'anchor', 'nap', 'inflight', 'strategic'];

// 30 min power nap, then whole 90 min sleep cycles, plus a full and a long night.
export const DEFAULT_NAP_OPTIONS = [30, 90, 180, 360, 480, 540];

// Minimum time between taking melatonin and the next sign-on.
export const MELATONIN_CLEAR = 8 * HOUR;

// After a late arrival, sleep may run this far past home wake time to stay in one block.
export const SLEEP_IN_MAX = 4 * HOUR;

// A ground stop shorter than this is a turnaround inside the same duty, not a rest.
export const TURN_MAX = 4 * HOUR;

export const KNOWN_AIRPORTS: Record<string, string> = Object.fromEntries(TRINITY_AIRPORTS.map(a => [a.code, a.tz]));

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ALL_TZ: string[] = (() => {
  try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; }
})();

export const baseCodes = (homeBase: string) => homeBase.toUpperCase().split(/[\s,]+/).filter(Boolean);

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

export function validTz(tz: string) {
  if (!tz) return false;
  try { partsFmt(tz); return true; } catch { return false; }
}

export function wallParts(utc: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of partsFmt(tz).formatToParts(new Date(utc))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return { year: o.year, month: o.month, day: o.day, hour: o.hour % 24, minute: o.minute, second: o.second };
}

export function tzOffsetMin(tz: string, utc: number) {
  const p = wallParts(utc, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utc) / MIN);
}

export function wallToUtc(wall: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall || '');
  if (!m) return NaN;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = naive - tzOffsetMin(tz, naive) * MIN;
  utc = naive - tzOffsetMin(tz, utc) * MIN;
  return utc;
}

export const pad = (n: number) => String(n).padStart(2, '0');

export function utcToWall(utc: number, tz: string) {
  const p = wallParts(utc, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export const clock = (utc: number, tz: string) => utcToWall(utc, tz).slice(11, 16);

export function dayLabel(utc: number, tz: string) {
  return new Date(utc).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const hm = (s: string) => {
  const [h, m] = (s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function intersect(a: Iv, b: Iv): Iv | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

export const overlap = (a: Iv, b: Iv) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
export const overlapAll = (a: Iv, list: Iv[]) => list.reduce((acc, b) => acc + overlap(a, b), 0);

export const fmtH = (h: number) => {
  const sign = h < 0 ? '-' : '';
  const a = Math.abs(h);
  const hh = Math.floor(a);
  const mm = Math.round((a - hh) * 60);
  return mm === 60 ? `${sign}${hh + 1}h00` : `${sign}${hh}h${pad(mm)}`;
};

export const fmtShift = (h: number) => (h === 0 ? '±0 h' : `${h > 0 ? '+' : '−'}${Math.abs(h) % 1 ? Math.abs(h).toFixed(1) : Math.abs(h)} h`);

/** Duration in minutes from "90", "90m", "1h30", "1h", "1:30". */
export function parseDur(s: string): number {
  const t = s.trim().toLowerCase();
  let m = /^(\d+)\s*h\s*(\d+)?\s*(m|min)?$/.exec(t);
  if (m) return +m[1] * 60 + +(m[2] || 0);
  m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d+)\s*(m|min)?$/.exec(t);
  if (m) return +m[1];
  return NaN;
}

export const fmtDur = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}`;
};

/** Longest allowed sleep block that fits in `availMin`, 0 if none. */
export function largestFit(availMin: number, options: number[]) {
  let best = 0;
  for (const o of options) if (o <= availMin + 0.5 && o > best) best = o;
  return best;
}

/** Habitual nights (bedtime -> wake) in `tz`, covering [from, to]. */
export function nightsIn(tz: string, bed: string, wake: string, from: number, to: number): Night[] {
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

/** The anchor core of a home night: a fixed block centred on its middle. */
export function coreOf(n: Iv, coreMin: number): Iv {
  const mid = (n.start + n.end) / 2;
  return { start: mid - (coreMin / 2) * MIN, end: mid + (coreMin / 2) * MIN };
}

/** Signed hours between a sleep midpoint and the habitual home-night midpoint, in [-12, 12). */
export function driftHours(iv: Iv, homeTz: string, bed: string, wake: string) {
  const bedMin = hm(bed);
  const len = (hm(wake) - bedMin + 1440) % 1440;
  const habitualMid = (bedMin + len / 2) % 1440;
  const p = wallParts((iv.start + iv.end) / 2, homeTz);
  const mid = p.hour * 60 + p.minute;
  return (((mid - habitualMid + 720) % 1440 + 1440) % 1440 - 720) / 60;
}

/** The evening date a moment belongs to, in home time (rows run noon to noon). */
export function eveningOf(t: number, homeTz: string) {
  const w = utcToWall(t, homeTz);
  return Number(w.slice(11, 13)) < 12 ? addDays(w.slice(0, 10), -1) : w.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Profile defaults, network, storage
// ---------------------------------------------------------------------------

export const newAirport = (code: string, fallbackTz: string): Airport => {
  const net = TRINITY_AIRPORTS.find(a => a.code === code);
  return {
    code,
    city: net?.city,
    tz: KNOWN_AIRPORTS[code] || fallbackTz,
    toBedMin: net?.toBedMin ?? 90,
    fromBedMin: net?.fromBedMin ?? 150,
  };
};

export const networkAirports = (): Airport[] => TRINITY_AIRPORTS.map(a => newAirport(a.code, a.tz));
export const networkRoutes = (): Route[] => TRINITY_ROUTES.map(r => ({ ...r }));

const routeKey = (r: Route) => `${r.from.toUpperCase()}>${r.to.toUpperCase()}`;

/** Fill in network flight numbers on routes that have none, keeping the user's own. */
function withNetworkFlightNos(routes: Route[]): Route[] {
  const known = new Map(networkRoutes().filter(r => r.flightNo).map(r => [routeKey(r), r.flightNo]));
  return routes.map(r => (r.flightNo || !known.has(routeKey(r)) ? r : { ...r, flightNo: known.get(routeKey(r)) }));
}

/** Add network airports and routes that are missing, keeping the user's edits. */
export function mergeNetwork(p: Profile): Profile {
  const codes = new Set(p.airports.map(a => a.code.toUpperCase()));
  const keys = new Set(p.routes.map(routeKey));
  return {
    ...p,
    airports: [...p.airports, ...networkAirports().filter(a => !codes.has(a.code))],
    routes: [...withNetworkFlightNos(p.routes), ...networkRoutes().filter(r => !keys.has(routeKey(r)))],
  };
}

export const newProfile = (): Profile => ({
  homeTz: 'Asia/Seoul',
  homeBase: 'ICN GMP',
  bedtime: '23:00',
  wake: '07:00',
  targetHours: 8,
  napOptionsMin: DEFAULT_NAP_OPTIONS,
  bunkSettleMin: 15,
  maxBunkRestMin: 180,
  serviceAfterTakeoffMin: 60,
  serviceBeforeLandingMin: 60,
  sleepBankMin: 90,
  strategicNap: true,
  strategicNapMin: 30,
  melatonin: true,
  melatoninLeadMin: 30,
  anchorCoreMin: 180,
  reportMin: 90,
  debriefMin: 30,
  restHomeMin: 12 * 60,
  restAwayMin: 10 * 60,
  restAtLeastDuty: true,
  airports: networkAirports(),
  routes: networkRoutes(),
  flights: [],
  sleeps: [],
  pendingStart: null,
});

/** Fill in fields added since a profile was saved; an empty network gets the Trinity defaults. */
export function normalizeProfile(data: Partial<Profile>): Profile {
  const p: Profile = { ...newProfile(), ...data };
  if (!data.airports?.length) p.airports = networkAirports();
  p.routes = data.routes?.length ? withNetworkFlightNos(data.routes) : networkRoutes();
  return p;
}

// Profiles live in this browser's localStorage; "Download" keeps a copy safe.
const LS_PROFILES = 'crew-sleep:profiles';
const LS_DRAFT = 'crew-sleep:draft';

export function readProfiles(): Record<string, Partial<Profile>> {
  try { return JSON.parse(localStorage.getItem(LS_PROFILES) || '{}') || {}; } catch { return {}; }
}

export function writeProfiles(store: Record<string, Partial<Profile>>) {
  try { localStorage.setItem(LS_PROFILES, JSON.stringify(store)); return true; } catch { return false; }
}

export function readDraft(): Partial<Profile> | null {
  try { return JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); } catch { return null; }
}

export function writeDraft(p: Profile) {
  try { localStorage.setItem(LS_DRAFT, JSON.stringify(p)); return true; } catch { return false; }
}

/** Route for a direction; block time falls back to the reverse direction. */
export function routeFor(routes: Route[], from: string, to: string) {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  const exact = routes.find(r => r.from.toUpperCase() === f && r.to.toUpperCase() === t);
  const reverse = routes.find(r => r.from.toUpperCase() === t && r.to.toUpperCase() === f);
  return { route: exact, blockMin: exact?.blockMin ?? reverse?.blockMin };
}

type RestRules = Pick<Profile, 'maxBunkRestMin' | 'bunkSettleMin' | 'serviceAfterTakeoffMin' | 'serviceBeforeLandingMin'>;

/**
 * Typical crew rest on a long flight: the time between the two meal services
 * is split in two halves (one per crew group) and each offers a bunk break no
 * longer than the cabin duties allow, centred in its half.
 */
export function defaultBreaks(blockMin: number, p: RestRules): RestBreak[] {
  if (blockMin < 8 * 60) return [];
  const round5 = (m: number) => Math.round(m / 5) * 5;
  const half = (blockMin - p.serviceAfterTakeoffMin - p.serviceBeforeLandingMin) / 2;
  if (half <= 0) return [];
  const len = round5(Math.min(half, p.maxBunkRestMin + p.bunkSettleMin));
  const lead = (half - len) / 2;
  return [
    { afterMin: round5(p.serviceAfterTakeoffMin + lead), lengthMin: len },
    { afterMin: round5(p.serviceAfterTakeoffMin + half + lead), lengthMin: len },
  ];
}

// ---------------------------------------------------------------------------
// Rotation: flights -> ground periods and trips
// ---------------------------------------------------------------------------

const AROUND_ROTATION = 2 * DAY;

export function parseRotation(p: Profile, homeTz: string) {
  const airports = new Map(p.airports.map(a => [a.code.toUpperCase(), a]));
  const bases = baseCodes(p.homeBase);
  const apOf = (code: string) => airports.get(code.toUpperCase());
  const tzOf = (code: string) => {
    const tz = apOf(code)?.tz;
    return tz && validTz(tz) ? tz : homeTz;
  };
  const groundAt = (code: string, start: number, end: number, inbound: ParsedFlight | null, outbound: ParsedFlight | null): Ground => ({
    id: `${inbound?.id ?? 'start'}>${outbound?.id ?? 'end'}`,
    code,
    tz: tzOf(code),
    airport: apOf(code) || newAirport(code, homeTz),
    isHome: bases.includes(code),
    start, end, inbound, outbound,
  });

  const flights: ParsedFlight[] = p.flights
    .map(f => ({ ...f, start: wallToUtc(f.depart, tzOf(f.from)), end: wallToUtc(f.arrive, tzOf(f.to)) }))
    .filter(f => f.end > f.start)
    .sort((a, b) => a.start - b.start);

  const grounds: Ground[] = [];
  const gaps: string[] = [];
  const first = flights[0];
  if (first && bases.includes(first.from.toUpperCase())) {
    grounds.push(groundAt(first.from.toUpperCase(), first.start - AROUND_ROTATION, first.start, null, first));
  }
  for (let i = 0; i + 1 < flights.length; i++) {
    const inbound = flights[i];
    const outbound = flights[i + 1];
    if (outbound.start <= inbound.end) { gaps.push(`${inbound.label || `${inbound.from}→${inbound.to}`} overlaps the next flight`); continue; }
    const arriveAt = inbound.to.toUpperCase();
    const leaveFrom = outbound.from.toUpperCase();
    if (arriveAt !== leaveFrom) {
      // Landing at one base and leaving from another (ICN / GMP) is still a stay at home.
      if (bases.includes(arriveAt) && bases.includes(leaveFrom)) {
        grounds.push({ ...groundAt(arriveAt, inbound.end, outbound.start, inbound, outbound), departAirport: apOf(leaveFrom) || newAirport(leaveFrom, homeTz) });
      } else {
        gaps.push(`Arrive ${inbound.to} but the next departure is from ${outbound.from}`);
      }
      continue;
    }
    grounds.push(groundAt(arriveAt, inbound.end, outbound.start, inbound, outbound));
  }
  const last = flights[flights.length - 1];
  if (last && bases.includes(last.to.toUpperCase())) {
    grounds.push(groundAt(last.to.toUpperCase(), last.end, last.end + AROUND_ROTATION, last, null));
  }

  // Trips: leave a base, come back to a base.
  const trips: Trip[] = [];
  let cur: ParsedFlight[] = [];
  const close = () => {
    if (!cur.length) return;
    trips.push({
      id: cur[0].id,
      flights: cur,
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      stops: cur.map(f => f.to.toUpperCase()).filter(c => !bases.includes(c)),
    });
    cur = [];
  };
  for (const f of flights) {
    if (cur.length && bases.includes(f.from.toUpperCase()) && bases.includes(cur[cur.length - 1].to.toUpperCase())) close();
    cur.push(f);
    if (bases.includes(f.to.toUpperCase())) close();
  }
  close();

  return { flights, grounds, trips, gaps, tzOf, apOf };
}

// ---------------------------------------------------------------------------
// Recommendations: hold home time
// ---------------------------------------------------------------------------

function groundAdvice(g: Ground, shift: number, hours: number) {
  const a = Math.abs(shift);
  if (g.isHome) return 'Home base: keep your usual schedule and pay back any sleep debt with full home nights.';
  if (a < 2) return 'Small time difference: keep your usual schedule.';
  if (hours < 24) return 'Quick turn: do not adapt at all. Rest only inside your home night; keep any other nap short.';
  if (hours < 72) {
    return 'Keep home time: sleep during your home night even if it is daylight outside. Blackout curtains, eye mask and earplugs.';
  }
  return 'Long layover: holding home time fully is hard. Protect at least a 4 h anchor sleep inside your home night every day; letting the rest drift toward local time is acceptable.';
}

/**
 * Pick the in-flight break that best fits home time and place the longest
 * allowed sleep block inside it. Preference: home night, then the home
 * afternoon dip; a break in the rest of the home day only gets a power nap.
 */
export function planFlight(f: ParsedFlight, p: Profile, homeTz: string, options: number[]): FlightPlan {
  const nights = nightsIn(homeTz, p.bedtime, p.wake, f.start - DAY, f.end + DAY);
  const cores = nights.map(n => coreOf(n, p.anchorCoreMin));
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

  // No rest during the meal services after takeoff and before landing.
  const restable = { start: f.start + p.serviceAfterTakeoffMin * MIN, end: f.end - p.serviceBeforeLandingMin * MIN };
  const breaks: BreakScore[] = f.breaks.map(b => {
    const iv = intersect({ start: f.start + b.afterMin * MIN, end: f.start + (b.afterMin + b.lengthMin) * MIN }, restable)
      ?? { start: f.start + b.afterMin * MIN, end: f.start + b.afterMin * MIN };
    const usable = { start: iv.start + p.bunkSettleMin * MIN, end: iv.end };
    // Cabin duties cap how long you can actually sleep, however long the break.
    const availMin = Math.min((usable.end - usable.start) / MIN, p.maxBunkRestMin);
    const empty = { ...iv, coreMin: 0, homeNightMin: 0, dipMin: 0, blockMin: 0, sleep: null, fit: 'none' as const };
    let blockMin = largestFit(availMin, options);
    if (!blockMin) return empty;

    // Prefer covering the anchor core, then the rest of the home night, then the afternoon dip.
    const inCore = place(usable, blockMin * MIN, cores);
    const atNight = inCore.overlapMin > 0 ? inCore : place(usable, blockMin * MIN, nights);
    if (atNight.overlapMin > 0) {
      return {
        ...iv, coreMin: inCore.overlapMin, homeNightMin: overlapAll(atNight.sleep, nights) / MIN,
        dipMin: 0, blockMin, sleep: atNight.sleep, fit: 'night' as const,
      };
    }
    const inDip = place(usable, blockMin * MIN, dips);
    if (inDip.overlapMin > 0) return { ...iv, coreMin: 0, homeNightMin: 0, dipMin: inDip.overlapMin, blockMin, sleep: inDip.sleep, fit: 'dip' as const };
    blockMin = largestFit(Math.min(30, availMin), options);
    if (!blockMin) return empty;
    return { ...iv, coreMin: 0, homeNightMin: 0, dipMin: 0, blockMin, sleep: { start: usable.start, end: usable.start + blockMin * MIN }, fit: 'power' as const };
  });

  const rank = (b: BreakScore) => [b.coreMin, b.homeNightMin, b.dipMin, b.blockMin];
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

/**
 * Plan every ground period. The second pass looks ahead: a main sleep followed
 * by a short night (overnight flight, early report, nothing planned) is
 * extended to bank sleep.
 */
export function planGrounds(grounds: Ground[], p: Profile, homeTz: string, options: number[], inflight: Iv[]): GroundPlan[] {
  const first = grounds.map(g => planGround(g, p, homeTz, options, inflight));
  const lookahead = {
    sleeps: [...inflight, ...first.flatMap(gp => gp.items.filter(i => SLEEP_KINDS.includes(i.kind)))],
    until: Math.max(...grounds.map(g => g.end)),
  };
  return grounds.map(g => planGround(g, p, homeTz, options, inflight, lookahead));
}

/** A flight worth a strategic nap before it: it eats into the home night, or it is a long duty. */
export function wantsStrategicNap(f: Iv, p: Profile, homeTz: string) {
  if (!p.strategicNap || p.strategicNapMin <= 0) return false;
  const nights = nightsIn(homeTz, p.bedtime, p.wake, f.start - DAY, f.end + DAY);
  return f.end - f.start >= 8 * HOUR || overlapAll(f, nights) >= 2 * HOUR;
}

// Time to find a quiet spot in the lounge and to wake up properly after the nap.
const LOUNGE_MARGIN = 20 * MIN;

export function planGround(
  g: Ground, p: Profile, homeTz: string, options: number[], inflight: Iv[],
  lookahead?: { sleeps: Iv[]; until: number },
): GroundPlan {
  const shift = (tzOffsetMin(g.tz, g.start) - tzOffsetMin(homeTz, g.start)) / 60;
  const hours = (g.end - g.start) / HOUR;
  const advice = groundAdvice(g, shift, hours);
  // Strategic nap: in the crew lounge, just before sign-on; you leave for the airport that much earlier.
  const lounge = g.outbound && wantsStrategicNap(g.outbound, p, homeTz)
    ? (() => {
      const end = g.outbound.start - p.reportMin * MIN - 10 * MIN;
      return { start: end - p.strategicNapMin * MIN, end };
    })()
    : null;
  const window = {
    start: g.start + (g.inbound ? g.airport.toBedMin * MIN : 0),
    end: g.end - (g.outbound ? (g.departAirport ?? g.airport).fromBedMin * MIN : 0)
      - (lounge ? p.strategicNapMin * MIN + LOUNGE_MARGIN : 0),
  };
  if (window.end <= window.start) {
    return { ground: g, shift, hours, window: null, items: lounge ? [{ ...lounge, kind: 'strategic' }] : [], advice };
  }

  const nights = nightsIn(homeTz, p.bedtime, p.wake, window.start - DAY, window.end + DAY);
  const habitualMin = (hm(p.wake) - hm(p.bedtime) + 1440) % 1440;
  const targetMin = p.targetHours * 60;
  const fullMin = Math.min(targetMin, habitualMin) * 0.75;
  const items: PlanItem[] = [];
  const fullNight = new Set<number>();
  const consolidated = new Set<number>(); // nights that got one contiguous block instead of anchor + nap
  const planned = () => [...inflight, ...items.filter(i => SLEEP_KINDS.includes(i.kind))];

  for (const n of nights) {
    const i = intersect(n, window);
    if (!i) continue;
    const cutShort = i.end < n.end;
    if (!cutShort && (i.end - i.start) / MIN >= fullMin) {
      items.push({ ...i, kind: 'sleep' });
      fullNight.add(n.start);
      continue;
    }
    let sleep: Iv;
    if (cutShort) {
      // A night cut short by an early departure: go to bed up to 2 h early,
      // end-aligned so you wake when you must get up.
      const start = Math.max(window.start, n.start - 2 * HOUR);
      const block = largestFit((i.end - start) / MIN, options);
      if (!block) continue;
      sleep = { start: i.end - block * MIN, end: i.end };
    } else {
      // Arrived during the home night: sleep as soon as you can be in bed and keep
      // going past home wake time, so the night stays one block instead of anchor + nap.
      const latest = Math.min(window.end, n.end + SLEEP_IN_MAX);
      const block = largestFit(Math.min(targetMin, (latest - i.start) / MIN), options);
      if (!block) continue;
      sleep = { start: i.start, end: i.start + block * MIN };
      consolidated.add(n.start);
    }
    const blockMin = (sleep.end - sleep.start) / MIN;
    const kind: PlanKind = blockMin >= fullMin ? 'sleep' : blockMin >= 90 ? 'anchor' : 'nap';
    items.push({ ...sleep, kind });
    if (kind === 'sleep') fullNight.add(n.start);
  }

  // Bank sleep: if the next night is short, sleep in (then go to bed earlier) by up to the allowance.
  if (lookahead && p.sleepBankMin > 0) {
    const mains = items.filter(i => i.kind === 'sleep' || i.kind === 'anchor').sort((a, b) => a.start - b.start);
    mains.forEach((it, k) => {
      const next = nights.find(n => n.start >= it.end);
      if (!next || next.end > lookahead.until) return; // beyond what we know of the rotation
      const around = { start: next.start - 3 * HOUR, end: next.end + 3 * HOUR };
      if (overlapAll(around, lookahead.sleeps) / MIN >= fullMin) return;
      const prevEnd = k > 0 ? mains[k - 1].end : window.start;
      const nextStart = k + 1 < mains.length ? mains[k + 1].start : window.end;
      const end = Math.min(window.end, nextStart, it.end + p.sleepBankMin * MIN);
      const left = p.sleepBankMin * MIN - (end - it.end);
      const start = Math.max(window.start, prevEnd, it.start - left);
      const banked = Math.round((end - it.end + it.start - start) / MIN);
      if (banked < 15) return;
      it.start = start;
      it.end = end;
      it.bankedMin = banked;
    });
  }

  const clip = (iv: Iv, kind: PlanKind, minMin: number) => {
    const i = intersect(iv, window);
    if (i && i.end - i.start >= minMin * MIN) items.push({ ...i, kind });
  };

  nights.forEach((n, k) => {
    // Day following this night.
    clip({ start: n.end, end: n.end + 3 * HOUR }, 'light', 20);
    const next = nights[k + 1];
    // Prefer one block of sleep: no top-up nap after a consolidated night, and no
    // pre-flight nap when the night before was already extended to bank sleep.
    const banked = items.some(i => i.bankedMin && overlap(i, { start: n.start - 3 * HOUR, end: n.end + SLEEP_IN_MAX }) > 0);
    // Sleep known around a night: this ground's plan, plus other grounds and the bunk once we look ahead.
    const known = () => (lookahead ? [...lookahead.sleeps, ...items.filter(i => SLEEP_KINDS.includes(i.kind))] : planned());
    const nightSleepMin = (m: Night) => overlapAll({ start: m.start - 3 * HOUR, end: m.end + 3 * HOUR }, known()) / MIN;
    // Pre-flight nap: only when a departure really eats the next night and nothing else covers it.
    const preFlight = !!next && !!g.outbound && next.end > window.end && !banked && nightSleepMin(next) < fullMin;
    // Top-up nap: only for a night this ground actually saw (not one before the plan starts).
    const topUp = !fullNight.has(n.start) && !consolidated.has(n.start) && (!!g.inbound || !!intersect(n, window));
    const slept = (at: number) => overlapAll({ start: at - DAY, end: at }, lookahead ? lookahead.sleeps : planned()) / MIN;
    const latest = next ? Math.min(next.start - 4 * HOUR, window.end) : window.end;
    if (next && topUp) {
      // The night was missed or cut short: recover as soon as you can be in bed,
      // then stay up so the next home night falls back to normal.
      const start = Math.max(n.end, window.start);
      if (latest - start >= 30 * MIN) {
        const block = largestFit(Math.min(targetMin - slept(start), (latest - start) / MIN), options);
        const nap = { start, end: start + block * MIN };
        if (block && overlapAll(nap, planned()) === 0) items.push({ ...nap, kind: 'nap', recovery: true });
      }
    } else if (next && preFlight) {
      // Before a night duty: bank a nap in the home afternoon dip.
      const start = Math.max(n.end + 7 * HOUR, window.start);
      if (start < n.end + 9 * HOUR && latest > start) {
        const block = largestFit(Math.min(90, (latest - start) / MIN), options);
        const nap = { start, end: start + block * MIN };
        if (block && overlapAll(nap, planned()) === 0) items.push({ ...nap, kind: 'nap' });
      }
    }
    // Evening before this night.
    clip({ start: n.start - 6 * HOUR, end: n.start - 2 * HOUR }, 'caffeine', 20);
    clip({ start: n.start - 2 * HOUR, end: n.start }, 'dim', 20);
  });

  // Sleeps less than an hour apart become one block.
  const merged: PlanItem[] = [];
  for (const it of items.filter(i => SLEEP_KINDS.includes(i.kind)).sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && it.start - last.end < HOUR) {
      last.end = Math.max(last.end, it.end);
      last.bankedMin = (last.bankedMin ?? 0) + (it.bankedMin ?? 0) || undefined;
      const len = (last.end - last.start) / MIN;
      last.kind = len >= fullMin ? 'sleep' : len >= 90 ? 'anchor' : 'nap';
    } else {
      merged.push({ ...it });
    }
  }
  items.splice(0, items.length, ...merged, ...items.filter(i => !SLEEP_KINDS.includes(i.kind)));
  if (lounge) items.push({ ...lounge, kind: 'strategic' });

  // Tips never run into a planned sleep: start them after it, or stop them before it.
  const sleeps = items.filter(i => SLEEP_KINDS.includes(i.kind)).sort((a, b) => a.start - b.start);
  const kept = items.flatMap(it => {
    if (SLEEP_KINDS.includes(it.kind)) return [it];
    const cut = { ...it };
    for (const sl of sleeps) {
      if (overlap(sl, cut) <= 0) continue;
      if (sl.start <= cut.start) cut.start = sl.end;
      else cut.end = Math.min(cut.end, sl.start);
    }
    return cut.end - cut.start >= 20 * MIN ? [cut] : [];
  });

  // Melatonin: only on layovers, only before sleep in the home night (where it keeps
  // the home clock instead of shifting it), and at least MELATONIN_CLEAR before the
  // next sign-on so it has worn off by duty.
  if (p.melatonin && !g.isHome) {
    for (const it of kept.filter(i => i.kind === 'sleep' || i.kind === 'anchor')) {
      // Taken late in the home night or in the home morning it would delay the clock instead.
      if (!nights.some(n => it.start >= n.start - 2 * HOUR && it.start <= n.end - 4 * HOUR)) continue;
      const t = it.start - p.melatoninLeadMin * MIN;
      if (g.outbound && g.outbound.start - p.reportMin * MIN - t < MELATONIN_CLEAR) continue;
      kept.push({ start: t, end: t, kind: 'melatonin' });
    }
  }
  kept.sort((a, b) => a.start - b.start);
  return { ground: g, shift, hours, window, items: kept, advice };
}

export function restChecks(grounds: Ground[], p: Profile) {
  const out = new Map<string, RestInfo>();
  let carry: { flightId: string; dutyStart: number } | null = null;
  for (const g of grounds) {
    if (!g.inbound || !g.outbound) { carry = null; continue; }
    const dutyStart: number = carry && carry.flightId === g.inbound.id ? carry.dutyStart : g.inbound.start - p.reportMin * MIN;
    const signOff = g.inbound.end + p.debriefMin * MIN;
    const signOn = g.outbound.start - p.reportMin * MIN;
    const dutyMin = (signOff - dutyStart) / MIN;
    if (g.end - g.start < TURN_MAX) {
      out.set(g.id, { turn: true, dutyMin, restMin: 0, requiredMin: 0, ok: true, earliestDepart: g.end });
      carry = { flightId: g.outbound.id, dutyStart };
      continue;
    }
    carry = null;
    const restMin = (signOn - signOff) / MIN;
    const requiredMin = Math.max(g.isHome ? p.restHomeMin : p.restAwayMin, p.restAtLeastDuty ? dutyMin : 0);
    out.set(g.id, {
      turn: false, dutyMin, restMin, requiredMin,
      ok: restMin >= requiredMin,
      earliestDepart: signOff + (requiredMin + p.reportMin) * MIN,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trip plan: one chronological list of what to do, in local time
// ---------------------------------------------------------------------------

export type EventKind = PlanKind | 'wakeup' | 'depart' | 'arrive' | 'inbed' | 'rest';

export interface PlanEvent extends Iv {
  kind: EventKind;
  tz: string;          // time zone the times are shown in
  place: string;       // where you are
  title: string;
  detail?: string;
  warn?: boolean;
  tip?: boolean;       // light / caffeine guidance, can be hidden
  bankedMin?: number;  // extra sleep banked before a short night
  recovery?: boolean;  // catch-up sleep right after a missed night
}

/** How far around a trip its plan reaches: the night before and the first recovery night. */
export const TRIP_BEFORE = 30 * HOUR;
export const TRIP_AFTER = 36 * HOUR;

export function tripEvents(
  trip: Trip,
  grounds: GroundPlan[],
  flights: FlightPlan[],
  rests: Map<string, RestInfo>,
  homeTz: string,
  cityOf: (code: string) => string,
): PlanEvent[] {
  const range = { start: trip.start - TRIP_BEFORE, end: trip.end + TRIP_AFTER };
  const events: PlanEvent[] = [];
  const ids = new Set(trip.flights.map(f => f.id));

  for (const fp of flights) {
    const f = fp.flight;
    if (!ids.has(f.id)) continue;
    const from = f.from.toUpperCase();
    const to = f.to.toUpperCase();
    const fromGround = grounds.find(gp => gp.ground.outbound?.id === f.id);
    const fromTz = fromGround?.ground.tz ?? homeTz;
    const toGround = grounds.find(gp => gp.ground.inbound?.id === f.id);
    const toTz = toGround?.ground.tz ?? homeTz;
    if (fromGround?.window) {
      const lounge = fromGround.items.some(i => i.kind === 'strategic');
      events.push({ start: fromGround.window.end, end: fromGround.window.end, kind: 'wakeup', tz: fromTz, place: from,
        title: 'Start getting ready',
        detail: `latest: preparation, commute${lounge ? ', lounge nap' : ''} and report for the ${clock(f.start, fromTz)} departure` });
    }
    events.push({ start: f.start, end: f.start, kind: 'depart', tz: fromTz, place: from,
      title: `${f.label ? `${f.label} · ` : ''}${from} → ${to}`,
      detail: `${cityOf(to) || to} · block ${fmtH((f.end - f.start) / HOUR)}` });
    if (fp.item) {
      const b = fp.breaks[fp.best];
      events.push({ ...fp.item, kind: 'inflight', tz: homeTz, place: 'in flight',
        title: `Bunk rest, break ${fp.best + 1}`,
        detail: b.fit === 'night' ? 'covers your home night' : b.fit === 'dip' ? 'in your home afternoon dip' : 'home daytime: keep it to a power nap' });
    }
    events.push({ start: f.end, end: f.end, kind: 'arrive', tz: toTz, place: to, title: `Arrive ${cityOf(to) || to}` });
    if (toGround?.window) {
      const rest = rests.get(toGround.ground.id);
      if (!rest?.turn) {
        events.push({ start: toGround.window.start, end: toGround.window.start, kind: 'inbed', tz: toTz, place: to,
          title: 'In bed from', detail: `after commute, shower and preparation` });
      }
    }
    const rest = toGround && rests.get(toGround.ground.id);
    if (rest && !rest.turn) {
      events.push({ start: f.end, end: f.end, kind: 'rest', tz: toTz, place: to, warn: !rest.ok,
        title: rest.ok ? `Rest ${fmtH(rest.restMin / 60)} (required ${fmtH(rest.requiredMin / 60)})` : `Short rest: ${fmtH(rest.restMin / 60)}, ${fmtH(rest.requiredMin / 60)} required`,
        detail: rest.ok ? `after a ${fmtH(rest.dutyMin / 60)} duty`
          : `after a ${fmtH(rest.dutyMin / 60)} duty · earliest legal departure ${dayLabel(rest.earliestDepart, toTz)} ${clock(rest.earliestDepart, toTz)}` });
    }
  }

  for (const gp of grounds) {
    if (!intersect(gp.ground, range)) continue;
    for (const it of gp.items) {
      // Point reminders (melatonin) have no duration, so test the range by position, not overlap.
      if (it.end < range.start || it.start > range.end) continue;
      const isSleep = SLEEP_KINDS.includes(it.kind);
      if (gp.ground.isHome && !isSleep) continue; // at home, only the sleep itself matters
      // The lounge nap happens at the departure airport (ICN or GMP may differ from where you landed).
      const place = it.kind === 'strategic' && gp.ground.outbound ? gp.ground.outbound.from.toUpperCase() : gp.ground.code;
      events.push({ ...it, kind: it.kind, tz: gp.ground.tz, place, tip: ['light', 'dim', 'caffeine'].includes(it.kind), title: '' });
    }
  }

  // Order of same-time events follows the day: get up, fly, arrive, rest, bed.
  const order: EventKind[] = ['wakeup', 'strategic', 'depart', 'inflight', 'arrive', 'rest', 'inbed', 'light', 'caffeine', 'dim', 'melatonin', 'nap', 'anchor', 'sleep'];
  return events.sort((a, b) => a.start - b.start || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** Planned sleep per home evening around a trip, against the sleep need. */
export function expectedSleep(trip: Trip, planned: Iv[], homeTz: string, targetHours: number) {
  const days: { date: string; minutes: number; deficit: number }[] = [];
  const first = eveningOf(trip.start - TRIP_BEFORE + 12 * HOUR, homeTz);
  const last = eveningOf(trip.end + 12 * HOUR, homeTz);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const row = { start: wallToUtc(`${d}T12:00`, homeTz), end: wallToUtc(`${addDays(d, 1)}T12:00`, homeTz) };
    const minutes = overlapAll(row, planned) / MIN;
    days.push({ date: d, minutes, deficit: Math.max(0, targetHours * 60 - minutes) });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Example data: a past Paris trip and a Sydney trip leaving today
// ---------------------------------------------------------------------------

export function exampleProfile(): Profile {
  const home = 'Asia/Seoul';
  const today = utcToWall(Date.now(), home).slice(0, 10);
  const at = (d: number, t: string) => `${addDays(today, d)}T${t}`;
  const base = newProfile();
  const leg = (label: string, from: string, to: string, depart: string): Flight => {
    const block = routeFor(base.routes, from, to).blockMin ?? 0;
    return {
      id: uid(), label, from, to, depart, breaks: defaultBreaks(block, base),
      arrive: utcToWall(wallToUtc(depart, KNOWN_AIRPORTS[from]) + block * MIN, KNOWN_AIRPORTS[to]),
    };
  };
  const p: Profile = {
    ...base,
    flights: [
      leg('TA501', 'ICN', 'CDG', at(-7, '12:50')),
      leg('TA502', 'CDG', 'ICN', at(-5, '20:30')),
      leg('TA811', 'ICN', 'SYD', at(0, '19:00')),
      leg('TA812', 'SYD', 'ICN', at(3, '09:30')),
    ],
  };
  const { grounds } = parseRotation(p, home);
  // [start day, home time, end day, home time, quality]
  const raw: [number, string, number, string, number][] = [
    [-10, '23:10', -9, '07:05', 4], [-9, '23:30', -8, '06:50', 4], [-8, '22:50', -7, '06:40', 3],
    [-6, '00:10', -6, '01:40', 2],
    [-6, '05:00', -6, '07:00', 3], [-6, '14:00', -6, '17:00', 3],
    [-6, '23:00', -5, '07:00', 4],
    [-5, '13:00', -5, '19:00', 2],
    [-4, '05:00', -4, '08:00', 2],
    [-4, '22:30', -3, '07:30', 3], [-3, '23:00', -2, '07:00', 4],
    [-2, '23:20', -1, '06:55', 4], [-1, '23:05', 0, '06:45', 5],
  ];
  p.sleeps = raw.map(([d0, t0, d1, t1, quality]) => {
    const start = wallToUtc(at(d0, t0), home);
    const end = wallToUtc(at(d1, t1), home);
    const tz = grounds.find(g => !g.isHome && start >= g.start && start < g.end)?.tz ?? home;
    return { id: uid(), tz, start: utcToWall(start, tz), end: utcToWall(end, tz), quality, note: '' };
  });
  return p;
}
