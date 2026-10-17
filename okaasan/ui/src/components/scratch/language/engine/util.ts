import type { Answer, Ctx, Progress, Review, SoundPack, Stat } from './types';

export function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickWeighted<T>(items: T[], weight: (x: T) => number): T {
  const ws = items.map(weight);
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const EMPTY_PROGRESS: Progress = {
  stats: {}, srs: {}, confusions: {}, lessons: {}, xp: 0, streak: 0, lastDay: '', bestQuiz: {}, time: {},
};

export const dayStr = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// Study time per day: seconds of a lesson (by the day they were spent) added in.
export function addTime(time: Record<string, number>, spent: Record<string, number>) {
  const next = { ...time };
  for (const [d, s] of Object.entries(spent)) next[d] = (next[d] || 0) + s;
  return next;
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Spaced repetition (Leitner boxes): right moves an item up one box and it
// comes back after that box's interval; wrong sends it back to box 0, due now.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
export const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 90];

// One update per item per session: any miss counts as a miss.
export function schedule(srs: Record<string, Review>, answers: Answer[], now = Date.now()): Record<string, Review> {
  const missed = new Set(answers.filter((a) => !a.ok).map((a) => a.key));
  const next = { ...srs };
  for (const key of new Set(answers.map((a) => a.key))) {
    const box = missed.has(key) ? 0 : Math.min((srs[key]?.box ?? 0) + 1, INTERVALS_DAYS.length - 1);
    next[key] = { box, due: now + INTERVALS_DAYS[box] * DAY };
  }
  return next;
}

export const isDueAt = (r: Review | undefined, now = Date.now()) => !r || r.due <= now;

export const dueCount = (p: Progress, keep: (k: string) => boolean, now = Date.now()) =>
  Object.entries(p.srs).filter(([k, r]) => keep(k) && r.due <= now).length;

// Due items weigh more the longer they are overdue; items not due yet much less.
function dueFactor(r: Review | undefined, now: number) {
  if (!r) return 1;
  if (r.due > now) return 0.25;
  return 1.5 + Math.min(5, (now - r.due) / DAY) * 0.2;
}

export const confusionKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Higher for things answered wrong often or seen rarely.
export function statWeakness(s: Stat | undefined) {
  if (!s) return 3;
  return 1 + (4 * s.bad) / (s.ok + s.bad + 1) + (s.ok < 3 ? 1 : 0);
}

export function makeCtx(progress: Progress, canListen: boolean, soundPack: SoundPack): Ctx {
  const partners: Record<string, [string, number][]> = {};
  for (const [pair, n] of Object.entries(progress.confusions)) {
    const [a, b] = pair.split('|');
    (partners[a] ||= []).push([b, n]);
    (partners[b] ||= []).push([a, n]);
  }
  const total = (k: string) => (partners[k] || []).reduce((s, [, n]) => s + n, 0);
  const now = Date.now();
  return {
    progress,
    canListen,
    soundPack,
    // Each confusion makes an item come back more often, up to 3x; due items
    // come first, items reviewed recently wait.
    weakness: (id) => statWeakness(progress.stats[id]) * (1 + 0.5 * Math.min(4, total(id))) * dueFactor(progress.srs[id], now),
    isDue: (id) => isDueAt(progress.srs[id], now),
    confusedWith: (key) => (partners[key] || []).slice().sort((x, y) => y[1] - x[1]).map(([k]) => k),
  };
}

// Confusions after a session: new mix-ups add one; a pair fades when its
// items are answered right without a slip: halved when one side was, gone
// when both were (the other side can be a wrong form that is never asked).
export function updateConfusions(confusions: Record<string, number>, answers: Answer[], confused: [string, string][]) {
  const missed = new Set<string>();
  const right = new Set<string>();
  for (const a of answers) {
    for (const k of a.option ? [a.key, a.option] : [a.key]) (a.ok ? right : missed).add(k);
  }
  const clean = (k: string) => right.has(k) && !missed.has(k);
  const next = { ...confusions };
  for (const [pair, n] of Object.entries(next)) {
    const [a, b] = pair.split('|');
    if (missed.has(a) || missed.has(b)) continue;
    const left = clean(a) && clean(b) ? 0 : clean(a) || clean(b) ? Math.floor(n / 2) : n;
    if (left > 0) next[pair] = left; else delete next[pair];
  }
  for (const [a, b] of confused) {
    if (a !== b) next[confusionKey(a, b)] = (next[confusionKey(a, b)] || 0) + 1;
  }
  return next;
}

// Most confused pairs first.
export function topConfusions(progress: Progress, keep: (k: string) => boolean, n = 8): [string, string, number][] {
  return Object.entries(progress.confusions)
    .map(([pair, count]) => [...pair.split('|'), count] as [string, string, number])
    .filter(([a, b]) => keep(a) && keep(b))
    .sort((x, y) => y[2] - x[2])
    .slice(0, n);
}

// Distractors: keys confused with the answer first, then each tier in order.
export function pickDistractors(
  answer: string, tiers: string[][], ok: (k: string, chosen: string[]) => boolean, n = 3, confused: string[] = [],
): string[] {
  const out: string[] = [];
  for (const tier of [confused, ...tiers]) {
    for (const k of tier) {
      if (out.length < n && k !== answer && !out.includes(k) && ok(k, out)) out.push(k);
    }
  }
  return out;
}
