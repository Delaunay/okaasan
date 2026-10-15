import type { Ctx, Progress, SoundPack, Stat } from './types';

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
  stats: {}, confusions: {}, lessons: {}, xp: 0, streak: 0, lastDay: '', bestQuiz: {},
};

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
  return {
    progress,
    canListen,
    soundPack,
    // Each confusion makes an item come back more often, up to 3x.
    weakness: (id) => statWeakness(progress.stats[id]) * (1 + 0.5 * Math.min(4, total(id))),
    confusedWith: (key) => (partners[key] || []).slice().sort((x, y) => y[1] - x[1]).map(([k]) => k),
  };
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
