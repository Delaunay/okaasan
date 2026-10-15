// Levels defined by JSON alone, for any language.
//
// items:    { units: [{ id, title, rule?, items: [{ id, q, a, rom?, alt?, confuse? }] }] }
//           q is the prompt (a number, a time, an English phrase), a the answer in
//           the target script; alt are other accepted answers, confuse known
//           wrong answers (offered as choices).
// dialogue: { units: [{ id, title, lines: [{ who, ko, rom?, en }] }] }
//           ko is the line in the target script (the field name is historical).
import { Box, Grid, HStack, Text, VStack } from '@chakra-ui/react';
import type { Ctx, Described, Ex, Feedback, LevelDef, Line, Option, Skill, UnitDef } from './types';
import { pickDistractors, pickWeighted, shuffle } from './util';
import { SpeakButton, masteryTone, useTrainer } from './widgets';

const LESSON_SIZE = 12;
const MATCH_MAX = 8;

interface Item { id: string; q: string; a: string; rom?: string; alt?: string[]; confuse?: string[] }
interface ItemUnit { id: string; title: string; rule?: string; items: Item[] }
interface DialogueLine { who: string; ko: string; rom?: string; en: string }
interface DialogueUnit { id: string; title: string; lines: DialogueLine[] }

// Everything the generic levels know about, for summaries and drills.
const registry = {
  items: {} as Record<string, Item>,
  itemUnit: {} as Record<string, ItemUnit>,
  lines: {} as Record<string, DialogueLine & { unit: DialogueUnit; index: number }>,
};

const started = <U extends { id: string }>(ctx: Ctx, units: U[]) => units.filter((u) => (ctx.progress.lessons[u.id] || 0) > 0);

// Fresh items first so each lesson covers new ground, then the weakest.
function pickLesson(ids: string[], ctx: Ctx, n = LESSON_SIZE): string[] {
  const fresh = shuffle(ids.filter((id) => !ctx.progress.stats[id]));
  const picks: string[] = [];
  while (picks.length < n && fresh.length) picks.push(fresh.pop()!);
  while (picks.length < n && ids.length) picks.push(pickWeighted(ids, (id) => ctx.weakness(id)));
  return picks;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const wrongKey = (text: string) => `x:${text}`;
const shuffleInPlace = (a: string[]) => a.splice(0, a.length, ...shuffle(a));

function itemEx(it: Item, unit: ItemUnit, ctx: Ctx, skill: Skill): Ex {
  const feedback: Feedback = {
    head: it.a,
    detail: it.rom ? `${it.q} · ${it.rom}` : it.q,
    note: it.alt?.length ? `Also correct: ${it.alt.join(', ')}` : undefined,
  };
  const others = unit.items.filter((o) => o.id !== it.id);
  const confused = ctx.confusedWith(it.id).filter((k) => registry.items[k]).slice(0, 2);
  if (skill === 'write') {
    return { kind: 'write', id: it.id, skill, feedback, accept: [it.a, ...(it.alt || [])], audioAfter: it.a, prompt: { title: 'Write it in full', text: it.q } };
  }
  if (skill === 'listen' && ctx.canListen) {
    const keys = shuffle([it.id, ...pickDistractors(it.id, [shuffle(others.map((o) => o.id))], () => true, 3, confused)]);
    return {
      kind: 'choice', id: it.id, skill, feedback, answer: it.id,
      prompt: { title: 'What do you hear?', audio: it.a, autoplay: true },
      options: keys.map((k) => ({ key: k, label: registry.items[k].q })),
    };
  }
  // Reading: either pick the right form for a prompt (known mistakes first),
  // or say what a form means.
  if (it.confuse?.length && Math.random() < 0.6) {
    // A known mistake can be another item's right answer (만 원): keep labels unique.
    const label = (k: string) => (k.startsWith('x:') ? k.slice(2) : registry.items[k].a);
    const wrong = shuffle(it.confuse).slice(0, 2).map(wrongKey);
    const pool = [...wrong, ...confused, ...shuffle(others.map((o) => o.id))];
    const keys = [it.id];
    for (const k of pool) if (keys.length < 4 && !keys.some((x) => label(x) === label(k))) keys.push(k);
    shuffleInPlace(keys);
    return {
      kind: 'choice', id: it.id, skill: 'read', feedback, answer: it.id, audioAfter: it.a,
      prompt: { title: 'How do you say this?', text: it.q },
      options: keys.map((k): Option => ({ key: k, label: label(k), script: true })),
    };
  }
  const keys = shuffle([it.id, ...pickDistractors(it.id, [shuffle(others.map((o) => o.id))], () => true, 3, confused)]);
  return {
    kind: 'choice', id: it.id, skill: 'read', feedback, answer: it.id, audioAfter: it.a,
    prompt: { title: 'What is this?', glyph: it.a },
    options: keys.map((k) => ({ key: k, label: registry.items[k].q })),
  };
}

function itemBoard(items: Item[]): Ex | null {
  const pairs = shuffle(items).slice(0, MATCH_MAX);
  return pairs.length >= 4 ? { kind: 'match', pairs: pairs.map((it) => ({ id: it.id, left: it.a, right: it.q, audio: it.a })) } : null;
}

function itemLesson(unit: ItemUnit, ctx: Ctx): Ex[] {
  const skills: Skill[] = ['read', 'read', 'listen', 'write'];
  const ex = pickLesson(unit.items.map((it) => it.id), ctx)
    .map((id) => itemEx(registry.items[id], unit, ctx, pickWeighted(skills, (s) => (s === 'listen' && !ctx.canListen ? 0 : 1))));
  const board = itemBoard(unit.items);
  if (board) ex.splice(4, 0, board);
  return [...(unit.rule ? [{ kind: 'rule', title: unit.title, text: unit.rule } as Ex] : []), ...ex];
}

// Every item read, heard and written.
function itemQuiz(units: ItemUnit[], ctx: Ctx): Ex[] {
  const skills: Skill[] = ctx.canListen ? ['read', 'listen', 'write'] : ['read', 'write'];
  return shuffle(units.flatMap((u) => u.items.flatMap((it) => skills.map((s) => itemEx(it, u, ctx, s)))));
}

function ItemsReference({ units }: { units: ItemUnit[] }) {
  return function Reference({ ctx }: { ctx: Ctx }) {
    const { pack, speak } = useTrainer();
    return (
      <VStack align="stretch" gap={5}>
        {units.map((u) => (
          <Box key={u.id}>
            <Text fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="wider" color="var(--muted-text)" mb={1}>{u.title}</Text>
            {u.rule && <Text fontSize="sm" color="var(--muted-text)" mb={2} fontFamily={pack.font}>{u.rule}</Text>}
            <Grid templateColumns="repeat(auto-fill, minmax(220px, 1fr))" gap={2}>
              {u.items.map((it) => {
                const tone = masteryTone(ctx.progress.stats[it.id]);
                return (
                  <HStack key={it.id} as="button" onClick={() => speak(it.a)} gap={3} p={2} borderRadius="lg" border="1px solid"
                    borderColor={tone.border} bg={tone.bg} textAlign="left">
                    <Text fontWeight={700} color={tone.color} minW="64px">{it.q}</Text>
                    <Text fontFamily={pack.font} color="var(--heading-color)">{it.a}</Text>
                  </HStack>
                );
              })}
            </Grid>
          </Box>
        ))}
      </VStack>
    );
  };
}

export function itemsLevel(id: string, title: string, data: { units: ItemUnit[] }): LevelDef {
  for (const u of data.units) {
    registry.itemUnit[u.id] = u;
    for (const it of u.items) registry.items[it.id] = it;
  }
  const units: UnitDef[] = data.units.map((u) => ({
    id: u.id,
    title: u.title,
    preview: u.items.slice(0, 4).map((it) => it.a).join(' · '),
    small: true,
    count: (ctx) => `${u.items.filter((it) => ctx.progress.stats[it.id]).length}/${u.items.length}`,
    build: (ctx) => itemLesson(u, ctx),
    quiz: { id: `${id}:${u.id}`, build: (ctx) => itemQuiz([u], ctx) },
  }));
  const all = data.units.flatMap((u) => u.items);
  return {
    id,
    title,
    units,
    quizzes: [
      { id: `${id}:started`, title: 'Started units', sizeLabel: 'items', size: (ctx) => started(ctx, data.units).reduce((n, u) => n + u.items.length, 0), build: (ctx) => itemQuiz(started(ctx, data.units), ctx) },
      { id: `${id}:all`, title: 'Everything', sizeLabel: 'items', size: () => all.length, build: (ctx) => itemQuiz(data.units, ctx) },
    ],
    quizBlurb: 'Every item read, heard and written. Each unit also has its own quiz.',
    review: {
      blurb: 'Mixed review of the units you have started, due items first.',
      available: (ctx) => started(ctx, data.units).length > 0,
      build: (ctx) => {
        const us = started(ctx, data.units);
        return pickLesson(us.flatMap((u) => u.items.map((it) => it.id)), ctx)
          .map((iid) => itemEx(registry.items[iid], us.find((u) => u.items.some((it) => it.id === iid))!, ctx, pickWeighted<Skill>(['read', 'listen', 'write'], (s) => (s === 'listen' && !ctx.canListen ? 0 : 1))));
      },
    },
    badge: (ctx) => `${all.filter((it) => ctx.progress.stats[it.id]?.ok).length}/${all.length} items`,
    owns: (k) => !!registry.items[k] || k.startsWith('x:'),
    reference: { label: 'List', Component: ItemsReference({ units: data.units }) },
  };
}

// ---------------------------------------------------------------------------
// Dialogues
// ---------------------------------------------------------------------------

const lineId = (u: DialogueUnit, i: number) => `${u.id}#${i}`;
const asLine = (l: DialogueLine): Line => ({ who: l.who, text: l.ko, rom: l.rom, en: l.en });

function lineEx(id: string, ctx: Ctx, skill?: Skill): Ex {
  const l = registry.lines[id];
  const allIds = Object.keys(registry.lines);
  const feedback: Feedback = { head: l.ko, detail: l.en, note: l.rom };
  const confused = ctx.confusedWith(id).filter((k) => registry.lines[k]).slice(0, 1);
  const tokens = l.ko.split(' ');
  const kinds: [string, number][] = [
    ['reply', l.index > 0 ? 3 : 0],
    ['meaning', 2],
    ['listen', ctx.canListen ? 2 : 0],
    ['order', tokens.length >= 3 && tokens.length <= 10 ? 2 : 0],
    ['write', tokens.length <= 3 ? 2 : 0],
  ];
  const bySkill: Record<Skill, string[]> = { read: ['reply', 'meaning', 'order'], listen: ['listen'], write: ['write', 'order'], grammar: [] };
  const allowed = kinds.filter(([k, w]) => w > 0 && (!skill || bySkill[skill].includes(k)));
  const kind = allowed.length ? pickWeighted(allowed, ([, w]) => w)[0] : 'meaning';
  const meanings = () => shuffle([id, ...pickDistractors(id, [shuffle(allIds)], (k) => registry.lines[k].en !== l.en, 3, confused)])
    .map((k) => ({ key: k, label: registry.lines[k].en }));

  if (kind === 'reply') {
    const prev = l.unit.lines[l.index - 1];
    // Wrong replies: lines that do not follow, preferably said by the same speaker.
    const pool = shuffle(allIds.filter((k) => k !== id && registry.lines[k].index > 0)).sort((a, b) => Number(registry.lines[b].who === l.who) - Number(registry.lines[a].who === l.who));
    const keys = shuffle([id, ...pickDistractors(id, [pool], () => true, 3, confused)]);
    return {
      kind: 'choice', id, skill: 'read', feedback, answer: id, audioAfter: l.ko,
      prompt: { title: 'What comes next?', bubbles: [{ ...asLine(prev), en: undefined }], audio: prev.ko, audioButton: 'none', autoplay: true },
      options: keys.map((k) => ({ key: k, label: registry.lines[k].ko, script: true })),
    };
  }
  if (kind === 'listen') {
    return { kind: 'choice', id, skill: 'listen', feedback, answer: id, prompt: { title: 'What does this mean?', audio: l.ko, autoplay: true }, options: meanings() };
  }
  if (kind === 'order') {
    return { kind: 'order', id, skill: skill === 'write' ? 'write' : 'read', feedback, tokens, audioAfter: l.ko, prompt: { title: 'Put the line in order', text: l.en } };
  }
  if (kind === 'write') {
    return ctx.canListen
      ? { kind: 'write', id, skill: 'write', feedback, accept: [l.ko], prompt: { title: 'Write what you hear', audio: l.ko, autoplay: true } }
      : { kind: 'write', id, skill: 'write', feedback, accept: [l.ko], audioAfter: l.ko, prompt: { title: 'Say it in the language', text: l.en } };
  }
  return {
    kind: 'choice', id, skill: 'read', feedback, answer: id, audioAfter: l.ko,
    prompt: { title: 'What does this mean?', bubbles: [{ ...asLine(l), en: undefined }] },
    options: meanings(),
  };
}

function dialogueLesson(u: DialogueUnit, ctx: Ctx): Ex[] {
  const ids = u.lines.map((_, i) => lineId(u, i));
  return [
    { kind: 'dialogue', title: u.title, lines: u.lines.map(asLine) },
    ...pickLesson(ids, ctx, Math.max(8, ids.length * 2)).map((id) => lineEx(id, ctx)),
  ];
}

function dialogueQuiz(units: DialogueUnit[], ctx: Ctx): Ex[] {
  const skills: Skill[] = ctx.canListen ? ['read', 'listen', 'write'] : ['read', 'write'];
  return shuffle(units.flatMap((u) => u.lines.flatMap((_, i) => skills.map((s) => lineEx(lineId(u, i), ctx, s)))));
}

function DialoguesReference({ units }: { units: DialogueUnit[] }) {
  return function Reference() {
    const { pack } = useTrainer();
    return (
      <VStack align="stretch" gap={5}>
        {units.map((u) => (
          <Box key={u.id}>
            <Text fontWeight={700} color="var(--heading-color)" mb={2}>{u.title}</Text>
            <VStack align="stretch" gap={2}>
              {u.lines.map((l, i) => (
                <HStack key={i} gap={3} align="start">
                  <SpeakButton text={l.ko} />
                  <Text fontWeight={700} color="var(--muted-text)" minW="16px">{l.who}</Text>
                  <VStack align="start" gap={0}>
                    <Text fontFamily={pack.font} color="var(--heading-color)">{l.ko}</Text>
                    {l.rom && <Text fontSize="xs" color="var(--muted-text)">{l.rom}</Text>}
                    <Text fontSize="sm" color="var(--muted-text)" fontStyle="italic">{l.en}</Text>
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </Box>
        ))}
      </VStack>
    );
  };
}

export function dialogueLevel(id: string, title: string, data: { units: DialogueUnit[] }): LevelDef {
  for (const u of data.units) u.lines.forEach((l, i) => { registry.lines[lineId(u, i)] = { ...l, unit: u, index: i }; });
  const total = data.units.reduce((n, u) => n + u.lines.length, 0);
  return {
    id,
    title,
    units: data.units.map((u) => ({
      id: u.id,
      title: u.title,
      preview: u.lines[0].ko,
      small: true,
      count: (ctx) => `${u.lines.filter((_, i) => ctx.progress.stats[lineId(u, i)]).length}/${u.lines.length}`,
      build: (ctx) => dialogueLesson(u, ctx),
      quiz: { id: `${id}:${u.id}`, build: (ctx) => dialogueQuiz([u], ctx) },
    })),
    quizzes: [
      { id: `${id}:started`, title: 'Started dialogues', sizeLabel: 'lines', size: (ctx) => started(ctx, data.units).reduce((n, u) => n + u.lines.length, 0), build: (ctx) => dialogueQuiz(started(ctx, data.units), ctx) },
      { id: `${id}:all`, title: 'Every dialogue', sizeLabel: 'lines', size: () => total, build: (ctx) => dialogueQuiz(data.units, ctx) },
    ],
    quizBlurb: 'Every line understood, heard and put back together. Each dialogue also has its own quiz.',
    review: {
      blurb: 'Mixed review of the dialogues you have started, due lines first.',
      available: (ctx) => started(ctx, data.units).length > 0,
      build: (ctx) => pickLesson(started(ctx, data.units).flatMap((u) => u.lines.map((_, i) => lineId(u, i))), ctx).map((lid) => lineEx(lid, ctx)),
    },
    badge: (ctx) => `${Object.keys(registry.lines).filter((k) => ctx.progress.stats[k]?.ok).length}/${total} lines`,
    owns: (k) => !!registry.lines[k],
    reference: { label: 'Dialogues', Component: DialoguesReference({ units: data.units }) },
  };
}

// ---------------------------------------------------------------------------
// Summaries and drills for generic keys
// ---------------------------------------------------------------------------

export function describeGeneric(k: string): Described | null {
  const it = registry.items[k];
  if (it) return { glyph: it.a, top: it.q, bottom: it.alt?.length ? `also ${it.alt.join(', ')}` : it.rom, audio: it.a };
  if (k.startsWith('x:')) return { glyph: k.slice(2), bottom: 'a common mistake' };
  const l = registry.lines[k];
  if (l) return { glyph: l.ko, bottom: l.en, audio: l.ko, size: 'sm' };
  return null;
}

export function drillGeneric(keys: string[], ctx: Ctx): Ex[] {
  const out: Ex[] = [];
  for (const k of keys) {
    const it = registry.items[k];
    if (it) {
      const unit = Object.values(registry.itemUnit).find((u) => u.items.includes(it))!;
      out.push(itemEx(it, unit, ctx, 'read'), itemEx(it, unit, ctx, ctx.canListen ? 'listen' : 'write'));
    }
    if (registry.lines[k]) out.push(lineEx(k, ctx, 'read'));
  }
  return out;
}
