// Turns the Korean data into the engine's generic exercises.
import type { Ctx, Ex, Feedback, MatchPair, Option, Skill } from '../engine/types';
import { pickDistractors, pickWeighted, shuffle } from '../engine/util';
import { JAMO, JAMO_BY, LETTER_NAMES, SIMILAR, UNITS, WORDS, WORD_BY, WORDS_UNIT, Word, homophones, jamoOf, soundOf } from './alphabet';
import { STROKES, strokeVariants } from './strokes';
import { NEW_WORDS_PER_LESSON, VOCAB, VOCAB_BY, VOCAB_REVIEW, VOCAB_UNITS, Vocab, synonyms, vkey } from './vocab';
import { CLOZE_BY, CONJ_BY, CONJ_RULES, FormKind, GRAMMAR_UNITS, PARTICLES, SENTENCE_BY, parseFormId, particleReason } from './grammar';
import { FORMS_BY } from './tenses';

const LESSON_SIZE = 12;
const VOCAB_LESSON_SIZE = 14;
const GRAMMAR_LESSON_SIZE = 12;
const MATCH_MIN = 5;
const MATCH_MAX = 8;

// Confused keys put first as wrong choices; a couple, so options still vary.
const CONFUSED_FIRST = 2;

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

export const knownLetters = (ctx: Ctx) =>
  new Set(UNITS.filter((u) => (ctx.progress.lessons[u.id] || 0) > 0).flatMap((u) => u.letters));

export const readableWords = (letters: Set<string>) => WORDS.filter((w) => jamoOf(w.ko).every((j) => letters.has(j)));

export const knownVocab = (ctx: Ctx) =>
  VOCAB_UNITS.filter((u) => (ctx.progress.lessons[u.id] || 0) > 0).flatMap((u) => u.words);

export const startedGrammar = (ctx: Ctx) => GRAMMAR_UNITS.filter((u) => (ctx.progress.lessons[u.id] || 0) > 0);

// ---------------------------------------------------------------------------
// Matching boards
// ---------------------------------------------------------------------------

const letterPair = (ch: string): MatchPair => ({ id: ch, left: ch, right: JAMO_BY[ch].rom, audio: soundOf(ch) });
const vocabPair = (ko: string): MatchPair => ({ id: vkey(ko), left: ko, right: VOCAB_BY[ko].en, audio: ko });

// Items with the same meaning never share a board: their right sides match.
function matchBoard(keys: string[], weight: (k: string) => number, toPair: (k: string) => MatchPair, clash?: (a: string, b: string) => boolean): Ex | null {
  const size = MATCH_MIN + Math.floor(Math.random() * (MATCH_MAX - MATCH_MIN + 1));
  const pool = Array.from(new Set(keys));
  const items: string[] = [];
  while (items.length < size && pool.length) {
    const k = pickWeighted(pool, weight);
    pool.splice(pool.indexOf(k), 1);
    if (!clash || !items.some((o) => clash(o, k))) items.push(k);
  }
  return items.length >= MATCH_MIN ? { kind: 'match', pairs: items.map(toPair) } : null;
}

// Every word on exactly one board of up to MATCH_MAX.
function matchBoards(words: string[]): string[][] {
  const boards: string[][] = Array.from({ length: Math.max(1, Math.ceil(words.length / MATCH_MAX)) }, () => []);
  for (const w of shuffle(words)) {
    const fits = boards
      .filter((b) => b.length < MATCH_MAX && !b.some((o) => synonyms(o, w)))
      .sort((a, b) => a.length - b.length)[0];
    if (fits) fits.push(w); else boards.push([w]);
  }
  return boards;
}

// ---------------------------------------------------------------------------
// Level 1: letters
// ---------------------------------------------------------------------------

type LetterKind = 'see' | 'listen' | 'rom' | 'draw';

function letterChoices(answer: string, pool: string[], ctx: Ctx, byEar = false): string[] {
  const kind = JAMO_BY[answer].kind;
  const ok = (x: string) => !!JAMO_BY[x] && JAMO_BY[x].kind === kind && !(byEar && homophones(answer, x));
  const group = SIMILAR.find((g) => g.includes(answer)) || '';
  const tiers = [shuffle(pool.filter((x) => group.includes(x))), shuffle(pool), shuffle(JAMO.map((j) => j.ch))];
  return shuffle([answer, ...pickDistractors(answer, tiers, ok, 3, ctx.confusedWith(answer).slice(0, CONFUSED_FIRST))]);
}

const asGlyphs = (keys: string[], withAudio = false): Option[] =>
  keys.map((k) => ({ key: k, label: k, script: true, audio: withAudio ? soundOf(k) : undefined }));

export function soundNote(ch: string, ctx: Ctx) {
  if (ctx.soundPack.names && LETTER_NAMES[ch]) return `this pack says the letter name, ${LETTER_NAMES[ch]}`;
  return JAMO_BY[ch].sayNote;
}

export function letterCard(ch: string, ctx: Ctx): Ex {
  const j = JAMO_BY[ch];
  const lines: { text: string; tone?: 'title' | 'body' | 'small' }[] = [{ text: j.rom, tone: 'title' }, { text: j.hint, tone: 'body' }];
  if (j.final && j.final !== j.rom) lines.push({ text: `At the end of a syllable: ${j.final}`, tone: 'small' });
  lines.push({ text: `Audio: ${soundNote(ch, ctx)}`, tone: 'small' });
  if (LETTER_NAMES[ch]) lines.push({ text: `Letter name: ${LETTER_NAMES[ch]}`, tone: 'small' });
  return { kind: 'card', card: { glyph: ch, audio: soundOf(ch), strokes: STROKES[ch], lines } };
}

export function letterEx(ch: string, pool: string[], ctx: Ctx, opts: { kind?: LetterKind; guided?: boolean } = {}): Ex {
  const kind = opts.kind ?? pickWeighted<LetterKind>(
    ['see', 'listen', 'rom', 'draw'],
    (k) => ({ see: 3, listen: ctx.canListen ? 3 : 0, rom: 2, draw: 2 })[k],
  );
  const j = JAMO_BY[ch];
  const feedback: Feedback = { head: ch, detail: j.rom, note: j.hint };
  const sound = soundOf(ch);
  if (kind === 'draw') {
    return {
      kind: 'draw', id: ch, skill: 'write', feedback,
      prompt: { title: 'Draw this letter, in stroke order', text: j.rom, audio: sound, audioButton: 'small' },
      variants: strokeVariants(ch),
      guided: opts.guided ?? (ctx.progress.stats[ch]?.ok || 0) < 2,
    };
  }
  if (kind === 'listen' && ctx.canListen) {
    return {
      kind: 'choice', id: ch, skill: 'listen', feedback, answer: ch,
      prompt: { title: 'Which letter do you hear?', audio: sound, autoplay: true },
      options: asGlyphs(letterChoices(ch, pool, ctx, true), true),
    };
  }
  if (kind === 'rom') {
    return {
      kind: 'choice', id: ch, skill: 'read', feedback, answer: ch, audioAfter: sound,
      prompt: { title: 'Which letter makes this sound?', text: j.rom, sub: j.hint },
      options: asGlyphs(letterChoices(ch, pool, ctx)),
    };
  }
  return {
    kind: 'choice', id: ch, skill: 'read', feedback, answer: ch, audioAfter: sound,
    prompt: { title: 'What sound does this letter make?', glyph: ch },
    options: letterChoices(ch, pool, ctx).map((k) => ({ key: k, label: JAMO_BY[k].rom })),
  };
}

export function wordEx(w: Word, pool: Word[], ctx: Ctx): Ex {
  const len = Array.from(w.ko).length;
  const others = shuffle(pool.map((x) => x.ko)).sort((a, b) => Math.abs(Array.from(a).length - len) - Math.abs(Array.from(b).length - len));
  const confused = ctx.confusedWith(w.ko).filter((k) => WORD_BY[k]).slice(0, CONFUSED_FIRST);
  const keys = shuffle([w.ko, ...pickDistractors(w.ko, [others], () => true, 3, confused)]);
  const feedback: Feedback = { head: w.ko, detail: w.rom, note: w.en };
  if (ctx.canListen && Math.random() < 0.4) {
    return {
      kind: 'choice', id: w.ko, skill: 'listen', feedback, answer: w.ko,
      prompt: { title: 'Which word do you hear?', audio: w.ko, autoplay: true },
      options: keys.map((k) => ({ key: k, label: k, script: true, audio: k })),
    };
  }
  return {
    kind: 'choice', id: w.ko, skill: 'read', feedback, answer: w.ko, audioAfter: w.ko,
    prompt: { title: 'How do you read this word?', glyph: w.ko },
    options: keys.map((k) => ({ key: k, label: WORD_BY[k].rom })),
  };
}

export function letterLesson(unitId: string, ctx: Ctx): Ex[] {
  const known = knownLetters(ctx);

  if (unitId === WORDS_UNIT) {
    const readable = readableWords(known);
    const words = readable.length >= 4 ? readable : WORDS;
    return Array.from({ length: LESSON_SIZE }, () => wordEx(pickWeighted(words, (w) => ctx.weakness(w.ko)), words, ctx));
  }

  const review = unitId === 'review';
  const unit = UNITS.find((u) => u.id === unitId);
  const current = unit ? unit.letters : [];
  const pool = Array.from(new Set([...current, ...Array.from(known)]));
  if (!pool.length) return [];
  const weight = (c: string) => (current.includes(c) ? 3 : 1) * ctx.weakness(c);

  // New letters: introduce each one, then ask about it right away.
  const intro: Ex[] = review ? [] : current
    .filter((c) => !ctx.progress.stats[c]?.ok)
    .flatMap((c) => [letterCard(c, ctx), letterEx(c, pool, ctx, { kind: 'see' })]);

  const quiz: Ex[] = Array.from({ length: LESSON_SIZE }, () => letterEx(pickWeighted(pool, weight), pool, ctx));
  const words = readableWords(new Set(pool));
  if (words.length >= 4) {
    for (let i = 0; i < (review ? 4 : 2); i++) quiz.push(wordEx(pickWeighted(words, (w) => ctx.weakness(w.ko)), words, ctx));
  }
  const board = matchBoard(pool, weight, letterPair);
  if (board) quiz.push(board);
  return [...intro, ...shuffle(quiz)];
}

export const LETTER_QUIZZES = (): { id: string; title: string; letters: string[] }[] => [
  { id: 'all', title: 'Whole alphabet', letters: JAMO.map((j) => j.ch) },
  { id: 'consonant', title: 'Consonants', letters: JAMO.filter((j) => j.kind === 'consonant').map((j) => j.ch) },
  { id: 'vowel', title: 'Vowels', letters: JAMO.filter((j) => j.kind === 'vowel').map((j) => j.ch) },
];

// Every letter once, no outline when drawing.
export function letterQuiz(letters: string[], ctx: Ctx): Ex[] {
  const all = JAMO.map((j) => j.ch);
  return shuffle(letters).map((c) => letterEx(c, all, ctx, { guided: false }));
}

// ---------------------------------------------------------------------------
// Level 2: vocabulary
// ---------------------------------------------------------------------------

// Never a synonym of the answer or of another choice; when the question is the
// spelling, prefer words sharing syllables so it has to be read carefully.
function vocabChoices(answer: string, pool: Vocab[], ctx: Ctx, bySpelling = false): string[] {
  const ok = (k: string, chosen: string[]) => !!VOCAB_BY[k] && !synonyms(k, answer) && !chosen.some((o) => synonyms(o, k));
  const shared = (ko: string) => Array.from(ko).filter((c) => c !== ' ' && answer.includes(c)).length;
  const tiers = [shuffle(pool.map((w) => w.ko)), shuffle(VOCAB.map((w) => w.ko))];
  if (bySpelling) tiers.unshift(shuffle(VOCAB.map((w) => w.ko).filter((k) => shared(k) > 0)).sort((a, b) => shared(b) - shared(a)));
  const confused = ctx.confusedWith(vkey(answer)).filter((k) => k.startsWith('v:')).map((k) => k.slice(2)).slice(0, CONFUSED_FIRST);
  return shuffle([answer, ...pickDistractors(answer, tiers, ok, 3, confused)]);
}

export function vocabCard(w: Vocab): Ex {
  return {
    kind: 'card',
    card: {
      glyph: w.ko,
      audio: w.ko,
      lines: [{ text: w.rom, tone: 'title' }, { text: w.en, tone: 'body' }],
      example: w.ex && { text: w.ex.ko, rom: w.ex.rom, en: w.ex.en },
    },
  };
}

export function vocabEx(ko: string, pool: Vocab[], ctx: Ctx, skill?: Skill): Ex {
  const w = VOCAB_BY[ko];
  const id = vkey(ko);
  const s = skill ?? pickWeighted<Skill>(['read', 'listen', 'write'], (k) => ({ read: 3, listen: ctx.canListen ? 3 : 0, write: 2, grammar: 0 })[k]);
  const coin = Math.random() < 0.5;
  const feedback: Feedback = { head: ko, detail: `${w.rom} · ${w.en}`, note: w.ex ? `${w.ex.ko} · ${w.ex.en}` : undefined };
  const meanings = (keys: string[]): Option[] => keys.map((k) => ({ key: vkey(k), label: VOCAB_BY[k].en }));
  const spellings = (keys: string[]): Option[] => keys.map((k) => ({ key: vkey(k), label: k, script: true }));

  if (s === 'write') {
    if (ctx.canListen && coin) {
      return { kind: 'write', id, skill: 'write', feedback, accept: [ko], prompt: { title: 'Write what you hear', audio: ko, autoplay: true } };
    }
    // Any word with the same meaning is accepted.
    return {
      kind: 'write', id, skill: 'write', feedback, audioAfter: ko,
      accept: VOCAB.filter((x) => synonyms(x.ko, ko)).map((x) => x.ko),
      prompt: { title: 'Write this in Korean', text: w.en },
    };
  }
  if (s === 'listen' && ctx.canListen) {
    return coin
      ? { kind: 'choice', id, skill: 'listen', feedback, answer: id, prompt: { title: 'What does this mean?', audio: ko, autoplay: true }, options: meanings(vocabChoices(ko, pool, ctx)) }
      : { kind: 'choice', id, skill: 'listen', feedback, answer: id, prompt: { title: 'Which word do you hear?', audio: ko, autoplay: true }, options: spellings(vocabChoices(ko, pool, ctx, true)) };
  }
  return coin
    ? { kind: 'choice', id, skill: 'read', feedback, answer: id, audioAfter: ko, prompt: { title: 'What does this mean?', glyph: ko }, options: meanings(vocabChoices(ko, pool, ctx)) }
    : { kind: 'choice', id, skill: 'read', feedback, answer: id, audioAfter: ko, prompt: { title: 'How do you say this in Korean?', text: w.en }, options: spellings(vocabChoices(ko, pool, ctx)) };
}

export function vocabLesson(unitId: string, ctx: Ctx): Ex[] {
  const unit = VOCAB_UNITS.find((u) => u.id === unitId);
  const current = unit ? unit.words : [];
  const known = knownVocab(ctx);
  const pool = Array.from(new Map([...current, ...known].map((w) => [w.ko, w])).values());
  const seenBefore = (w: Vocab) => !!ctx.progress.stats[vkey(w.ko)];

  // A few new words per lesson: a card for each, then a quick read on each.
  const fresh = current.filter((w) => !seenBefore(w)).slice(0, NEW_WORDS_PER_LESSON);
  const intro: Ex[] = [...fresh.map(vocabCard), ...shuffle(fresh).map((w) => vocabEx(w.ko, pool, ctx, 'read'))];

  // Practice what has been introduced; never quiz a word before its card.
  const targets = unitId === VOCAB_REVIEW ? known : current.filter((w) => seenBefore(w) || fresh.includes(w));
  const candidates = [...targets, ...known.filter((w) => !targets.includes(w))];
  if (!candidates.length) return intro;
  const weight = (w: Vocab) => (targets.includes(w) ? 3 : 1) * ctx.weakness(vkey(w.ko));
  const quiz = Array.from({ length: VOCAB_LESSON_SIZE }, () => vocabEx(pickWeighted(candidates, weight).ko, pool, ctx));
  // Two boards: one early on the new words, one at the end mixing in older ones.
  const keys = candidates.map((w) => w.ko);
  for (const at of [3, quiz.length]) {
    const board = matchBoard(keys, (k) => weight(VOCAB_BY[k]), vocabPair, synonyms);
    if (board) quiz.splice(at, 0, board);
  }
  return [...intro, ...quiz];
}

export function vocabQuizWords(scope: string, ctx: Ctx): Vocab[] {
  if (scope === 'all') return VOCAB;
  if (scope === 'learned') return knownVocab(ctx);
  return VOCAB_UNITS.find((u) => u.id === scope)?.words || [];
}

// Every word: reading through matching boards, then listening and writing.
export function vocabQuiz(scope: string, ctx: Ctx): Ex[] {
  const words = vocabQuizWords(scope, ctx).map((w) => w.ko);
  const skills: Skill[] = ctx.canListen ? ['listen', 'write'] : ['write'];
  const boards = matchBoards(words);
  const reading: Ex[] = boards.every((b) => b.length >= 3)
    ? boards.map((b) => ({ kind: 'match', pairs: b.map(vocabPair) }))
    : words.map((ko) => vocabEx(ko, VOCAB, ctx, 'read'));
  return shuffle([...reading, ...words.flatMap((ko) => skills.map((s) => vocabEx(ko, VOCAB, ctx, s)))]);
}

// ---------------------------------------------------------------------------
// Level 3: sentences
// ---------------------------------------------------------------------------

export const particleKey = (p: string) => `pt:${p}`;
export const formKey = (f: string) => `cf:${f}`;

const FORM_TITLES: Record<FormKind, [string, string]> = {
  past: ['Which is the past tense?', 'Write the past tense'],
  future: ['Which is the future?', 'Write the future'],
  prog: ['Which means "doing it right now"?', 'Write "doing it right now" (고 있어요)'],
  neg: ['Make it negative with 안', 'Make it negative with 안'],
  negji: ['Make it negative with 지 않아요', 'Make it negative with 지 않아요'],
};

// Tenses: the other forms of the same verb as choices. Negation: the classic
// mistakes (안 in the wrong place, 안아요 for 않아요).
function formEx(id: string, recall: boolean): Ex {
  const { kind, dict } = parseFormId(id);
  const f = FORMS_BY[dict];
  const polite = CONJ_BY[`c:${dict}`]?.polite ?? dict;
  const answer = f[kind]!;
  const stem = dict.slice(0, -1);
  const feedback: Feedback = { head: `${dict} → ${answer}`, detail: VOCAB_BY[dict]?.en };
  const prompt = { glyph: kind === 'neg' || kind === 'negji' ? polite : dict, sub: VOCAB_BY[dict]?.en };
  if (recall || Math.random() < 0.5) {
    return { kind: 'write', id, skill: 'write', feedback, accept: [answer], audioAfter: answer, prompt: { ...prompt, title: FORM_TITLES[kind][1] } };
  }
  let wrong: string[];
  if (kind === 'neg') {
    const noun = answer.endsWith(' 안 해요') && answer !== '안 해요' ? answer.slice(0, -' 안 해요'.length) : null;
    wrong = f.type === 'x'
      ? [polite, `안 ${polite}`, `안 ${answer}`]   // 안 있어요, 안 이에요: 있다 and 이다 have their own negatives
      : [polite, noun ? `안 ${polite}` : `${polite} 안`, `${stem}지 안아요`, `안 ${stem}지 않아요`];
  } else if (kind === 'negji') {
    wrong = [`${stem}지 안아요`, `${stem}지 않요`, `${stem}지 안 해요`];
  } else {
    // Other tenses of the same verb, plus a naive past (가요 → 가었어요).
    wrong = [polite, f.past, f.future, f.prog, `${polite.replace(/요$/, '')}었어요`].filter((x): x is string => !!x && x !== answer);
  }
  const choices = shuffle([answer, ...shuffle(Array.from(new Set(wrong.filter((w) => w !== answer)))).slice(0, 3)]);
  return {
    kind: 'choice', id, skill: 'grammar', feedback, answer: formKey(answer), audioAfter: answer,
    prompt: { ...prompt, title: FORM_TITLES[kind][0] },
    options: choices.map((x) => ({ key: formKey(x), label: x, script: true })),
  };
}

// `recall` asks for the typed polite form (quizzes).
export function grammarEx(id: string, ctx: Ctx, recall = false): Ex {
  if (id.startsWith('t:')) return formEx(id, recall);
  if (id.startsWith('p:')) {
    const c = CLOZE_BY[id];
    const confused = ctx.confusedWith(particleKey(c.particle)).map((k) => k.slice(3)).filter((p) => PARTICLES[p]).slice(0, 1);
    const choices = shuffle([c.particle, ...pickDistractors(c.particle, [PARTICLES[c.particle].confuse, shuffle(Object.keys(PARTICLES))], (k) => !!PARTICLES[k], 3, confused)]);
    return {
      kind: 'choice', id, skill: 'grammar', answer: particleKey(c.particle), audioAfter: c.sentence.ko,
      prompt: { title: 'Fill in the particle', sub: c.sentence.en, cloze: { before: c.before, after: c.after } },
      options: choices.map((p) => ({ key: particleKey(p), label: p, script: true })),
      feedback: { head: c.sentence.ko, detail: c.sentence.en, note: particleReason(c.particle, c.before) },
    };
  }
  if (id.startsWith('c:')) {
    const c = CONJ_BY[id];
    const feedback: Feedback = { head: `${c.dict} → ${c.polite}`, note: CONJ_RULES[c.rule] };
    const prompt = { glyph: c.dict, sub: VOCAB_BY[c.dict]?.en };
    if (recall || Math.random() < 0.5) {
      return { kind: 'write', id, skill: 'write', feedback, accept: [c.polite], audioAfter: c.polite, prompt: { ...prompt, title: 'Write the polite (해요) form' } };
    }
    return {
      kind: 'choice', id, skill: 'grammar', feedback, answer: formKey(c.polite), audioAfter: c.polite,
      prompt: { ...prompt, title: 'Pick the polite (해요) form' },
      options: shuffle([c.polite, ...c.wrong]).map((f) => ({ key: formKey(f), label: f, script: true })),
    };
  }
  const ko = id.slice(2);
  const sn = SENTENCE_BY[ko];
  const feedback: Feedback = { head: ko, detail: sn.en, note: sn.rom };
  if (ctx.canListen && ko.split(' ').length <= 4 && Math.random() < 0.25) {
    return { kind: 'write', id, skill: 'write', feedback, accept: [ko], prompt: { title: 'Write the sentence you hear', audio: ko, autoplay: true } };
  }
  return ctx.canListen && Math.random() < 0.4
    ? { kind: 'order', id, skill: 'listen', feedback, tokens: ko.split(' '), prompt: { title: 'Put what you hear in order', audio: ko, autoplay: true } }
    : { kind: 'order', id, skill: 'read', feedback, tokens: ko.split(' '), audioAfter: ko, prompt: { title: 'Put the sentence in order', text: sn.en } };
}

// Items whose particle has been confused come back more often.
function grammarWeight(id: string, ctx: Ctx) {
  const c = CLOZE_BY[id];
  return ctx.weakness(id) * (c && ctx.confusedWith(particleKey(c.particle)).length ? 1.5 : 1);
}

export function grammarLesson(unitId: string, ctx: Ctx): Ex[] {
  const unit = GRAMMAR_UNITS.find((u) => u.id === unitId);
  const items = unit ? unit.items : startedGrammar(ctx).flatMap((u) => u.items);
  if (!items.length) return [];
  // New items first so each lesson covers new ground, then the weakest ones.
  const fresh = shuffle(items.filter((id) => !ctx.progress.stats[id]));
  const picks: string[] = [];
  while (picks.length < GRAMMAR_LESSON_SIZE && fresh.length) picks.push(fresh.pop()!);
  while (picks.length < GRAMMAR_LESSON_SIZE) picks.push(pickWeighted(items, (id) => grammarWeight(id, ctx)));
  const rule: Ex[] = unit ? [{ kind: 'rule', title: unit.title, text: unit.rule }] : [];
  return [...rule, ...shuffle(picks).map((id) => grammarEx(id, ctx))];
}

export function grammarQuizItems(scope: string, ctx: Ctx): string[] {
  if (scope === 'all') return GRAMMAR_UNITS.flatMap((u) => u.items);
  if (scope === 'started') return startedGrammar(ctx).flatMap((u) => u.items);
  return GRAMMAR_UNITS.find((u) => u.id === scope)?.items || [];
}

export const grammarQuiz = (scope: string, ctx: Ctx): Ex[] =>
  shuffle(grammarQuizItems(scope, ctx).map((id) => grammarEx(id, ctx, true)));

// ---------------------------------------------------------------------------
// Confusion drill: each confused item asked with its partners as choices
// (confusedWith puts them first), plus a board when there are enough.
// ---------------------------------------------------------------------------

export function drill(keys: string[], ctx: Ctx): Ex[] {
  const out: Ex[] = [];
  const letters = keys.filter((k) => JAMO_BY[k]);
  const vocab = keys.filter((k) => k.startsWith('v:')).map((k) => k.slice(2)).filter((k) => VOCAB_BY[k]);
  for (const ch of letters) {
    out.push(letterEx(ch, letters, ctx, { kind: 'see' }));
    out.push(letterEx(ch, letters, ctx, { kind: ctx.canListen ? 'listen' : 'rom' }));
  }
  for (const k of keys.filter((x) => WORD_BY[x])) out.push(wordEx(WORD_BY[k], WORDS, ctx));
  for (const ko of vocab) {
    out.push(vocabEx(ko, VOCAB, ctx, 'read'));
    if (ctx.canListen) out.push(vocabEx(ko, VOCAB, ctx, 'listen'));
  }
  for (const k of keys.filter((x) => x.startsWith('pt:'))) {
    const p = k.slice(3);
    const ids = shuffle(Object.keys(CLOZE_BY).filter((id) => CLOZE_BY[id].particle === p)).slice(0, 2);
    out.push(...ids.map((id) => grammarEx(id, ctx)));
  }
  for (const k of keys.filter((x) => x.startsWith('cf:') || x.startsWith('c:'))) {
    const form = k.slice(k.indexOf(':') + 1);
    const conj = Object.keys(CONJ_BY).find((id) => id === k || CONJ_BY[id].polite === form || CONJ_BY[id].wrong.includes(form));
    if (conj) out.push(grammarEx(conj, ctx));
  }
  for (const k of keys.filter((x) => x.startsWith('p:') || x.startsWith('o:') || x.startsWith('t:'))) out.push(grammarEx(k, ctx));
  if (letters.length >= MATCH_MIN) out.push({ kind: 'match', pairs: letters.slice(0, MATCH_MAX).map(letterPair) });
  const board = matchBoard(vocab, () => 1, vocabPair, synonyms);
  if (board) out.push(board);
  return shuffle(out).slice(0, 24);
}
