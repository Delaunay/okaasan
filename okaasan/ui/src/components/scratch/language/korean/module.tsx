// The Korean language module: the code side of the pack in
// website/uploads/language/korean/ (data is loaded from there). It holds what
// JSON cannot: building and splitting Hangul syllables, the sound and batchim
// rules behind explanations, and how letters, words and grammar items turn
// into exercises. Conversations and numbers are generic levels (pack.json).
import { useState } from 'react';
import { Box, Button, Flex, Grid, HStack, Text, VStack } from '@chakra-ui/react';
import { RotateCcw } from 'lucide-react';
import type { Ctx, Described, LanguageModule, LevelDef } from '../engine/types';
import { StrokeAnim, StrokePad } from '../engine/strokes';
import { SpeakButton, masteryTone, useTrainer } from '../engine/widgets';
import { GROUPS, JAMO, JAMO_BY, LETTER_NAMES, UNITS, WORD_BY, WORDS_UNIT, initAlphabet, soundOf } from './alphabet';
import { STROKES, initStrokes, strokeVariants } from './strokes';
import { VOCAB, VOCAB_BY, VOCAB_REVIEW, VOCAB_UNITS, initVocab, normalize, vkey } from './vocab';
import { CLOZE_BY, CONJ_BY, CONJ_RULES, CONJ_UNITS, GRAMMAR_UNITS, PARTICLES, RULES, SENTENCE_BY, initGrammar, parseFormId } from './grammar';
import { FORMS_BY } from './tenses';
import { composeKeys } from './hangul';
import {
  LETTER_QUIZZES, drill, grammarLesson, grammarQuiz, grammarQuizItems, knownLetters, knownVocab,
  letterLesson, letterQuiz, readableWords, startedGrammar, vocabLesson, vocabQuiz, vocabQuizWords,
} from './exercises';

const KEYS_HELP = 'Keyboard: 1–4 to pick, Enter to check / continue, Space to replay the sound.';

// ---------------------------------------------------------------------------
// Reference views
// ---------------------------------------------------------------------------

function Chart({ ctx }: { ctx: Ctx }) {
  const { pack, speak } = useTrainer();
  const [sel, setSel] = useState('ㄱ');
  const [replay, setReplay] = useState(0);
  const [padKey, setPadKey] = useState(0);
  const j = JAMO_BY[sel];

  const choose = (ch: string) => {
    setSel(ch);
    setReplay((r) => r + 1);
    setPadKey((k) => k + 1);
    speak(soundOf(ch));
  };

  return (
    <Flex gap={6} wrap="wrap" align="start">
      <VStack flex="1 1 320px" align="stretch" gap={4}>
        {GROUPS.map((g) => (
          <Box key={g}>
            <Text fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="wider" color="var(--muted-text)" mb={2}>{g}</Text>
            <Grid templateColumns="repeat(auto-fill, minmax(62px, 1fr))" gap={2}>
              {JAMO.filter((x) => x.group === g).map((x) => {
                const tone = masteryTone(ctx.progress.stats[x.ch]);
                return (
                  <Box key={x.ch} as="button" onClick={() => choose(x.ch)} p={1} borderRadius="lg" border="2px solid"
                    borderColor={sel === x.ch ? 'var(--panel-blue-text)' : tone.border} bg={tone.bg} textAlign="center">
                    <Text fontSize="28px" lineHeight={1.2} fontFamily={pack.font} color="var(--heading-color)">{x.ch}</Text>
                    <Text fontSize="xs" color={tone.color} fontWeight={600}>{x.rom}</Text>
                  </Box>
                );
              })}
            </Grid>
          </Box>
        ))}
        <HStack gap={3} fontSize="xs" color="var(--muted-text)">
          <HStack gap={1}><Box w="10px" h="10px" borderRadius="sm" bg="var(--panel-orange-bg)" border="1px solid var(--panel-orange-border)" /> learning</HStack>
          <HStack gap={1}><Box w="10px" h="10px" borderRadius="sm" bg="var(--panel-green-bg)" border="1px solid var(--panel-green-border)" /> known</HStack>
        </HStack>
      </VStack>

      <VStack flex="0 1 320px" align="stretch" gap={3} p={4} borderRadius="xl" border="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
        <HStack gap={3}>
          <Text fontSize="64px" lineHeight={1} fontFamily={pack.font} color="var(--heading-color)">{j.ch}</Text>
          <VStack align="start" gap={0} flex={1}>
            <Text fontSize="2xl" fontWeight={700} color="var(--panel-blue-text)">{j.rom}</Text>
            <Text fontSize="sm" color="var(--muted-text)">{j.hint}</Text>
            {j.final && <Text fontSize="xs" color="var(--muted-text)">Final: {j.final}</Text>}
            {LETTER_NAMES[j.ch] && <Text fontSize="xs" color="var(--muted-text)">Name: <span style={{ fontFamily: pack.font }}>{LETTER_NAMES[j.ch]}</span></Text>}
          </VStack>
          <SpeakButton text={soundOf(j.ch)} />
        </HStack>
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight={600} color="var(--heading-color)">Stroke order</Text>
          <Button size="xs" variant="ghost" onClick={() => setReplay((r) => r + 1)}><RotateCcw size={12} /> Replay</Button>
        </HStack>
        <Flex justify="center"><StrokeAnim key={`${sel}-${replay}`} strokes={STROKES[sel]} size={180} /></Flex>
        <Text fontSize="sm" fontWeight={600} color="var(--heading-color)">Try it</Text>
        <Flex justify="center">
          <StrokePad key={`${sel}-${padKey}`} variants={strokeVariants(sel)} guided size={220}
            onDone={() => setTimeout(() => setPadKey((k) => k + 1), 900)} />
        </Flex>
      </VStack>
    </Flex>
  );
}

function WordList({ ctx }: { ctx: Ctx }) {
  const { pack, speak } = useTrainer();
  return (
    <VStack align="stretch" gap={5}>
      {VOCAB_UNITS.map((u) => (
        <Box key={u.id}>
          <Text fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="wider" color="var(--muted-text)" mb={2}>{u.title}</Text>
          <Grid templateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap={2}>
            {u.words.map((w) => {
              const tone = masteryTone(ctx.progress.stats[vkey(w.ko)]);
              return (
                <Box key={w.ko} p={2} borderRadius="lg" border="1px solid" borderColor={tone.border} bg={tone.bg}>
                  <HStack gap={2} as="button" onClick={() => speak(w.ko)} w="100%" textAlign="left">
                    <Text fontSize="22px" fontFamily={pack.font} color="var(--heading-color)">{w.ko}</Text>
                    <VStack align="start" gap={0} minW={0}>
                      <Text fontSize="xs" fontWeight={600} color={tone.color}>{w.rom}</Text>
                      <Text fontSize="sm" color="var(--heading-color)" truncate>{w.en}</Text>
                    </VStack>
                  </HStack>
                  {w.ex && (
                    <Box as="button" onClick={() => speak(w.ex!.ko)} textAlign="left" mt={1}>
                      <Text fontSize="xs" fontFamily={pack.font} color="var(--muted-text)">{w.ex.ko}</Text>
                      <Text fontSize="xs" color="var(--muted-text)" fontStyle="italic">{w.ex.en}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Grid>
        </Box>
      ))}
    </VStack>
  );
}

function GrammarNotes() {
  const { pack, speak } = useTrainer();
  const rules = RULES;
  return (
    <VStack align="stretch" gap={4}>
      {rules.map((r) => (
        <Box key={r.title} p={4} borderRadius="lg" bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)">
          <Text fontWeight={700} color="var(--heading-color)" mb={1}>{r.title}</Text>
          <Text fontSize="sm" color="var(--heading-color)" fontFamily={pack.font} lineHeight={1.7}>{r.text}</Text>
        </Box>
      ))}
      {CONJ_UNITS.map((u) => (
        <Box key={u.id}>
          <Text fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="wider" color="var(--muted-text)" mb={2}>{u.title}</Text>
          <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={2}>
            {u.items.map((c) => (
              <HStack key={c.dict} as="button" onClick={() => speak(c.polite)} gap={3} p={2} borderRadius="lg" border="1px solid"
                borderColor="var(--border-color)" bg="var(--card-bg)" textAlign="left" align="start">
                <Text fontFamily={pack.font} fontSize="lg" color="var(--heading-color)" flexShrink={0}>{c.dict} → <b>{c.polite}</b></Text>
                <Text fontSize="xs" color="var(--muted-text)">{CONJ_RULES[c.rule]}</Text>
              </HStack>
            ))}
          </Grid>
        </Box>
      ))}
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Levels (built after the data is loaded)
// ---------------------------------------------------------------------------

const alphabetLevel = (id: string, title: string): LevelDef => ({
  id,
  title,
  units: [
    ...UNITS.map((u) => ({ id: u.id, title: u.title, preview: u.letters.join(''), build: (ctx: Ctx) => letterLesson(u.id, ctx) })),
    {
      id: WORDS_UNIT,
      title: 'Read words',
      preview: '나무 다리 고기 아이 바다 커피',
      count: (ctx: Ctx) => `${readableWords(knownLetters(ctx)).length} with your letters`,
      build: (ctx: Ctx) => letterLesson(WORDS_UNIT, ctx),
    },
  ],
  quizzes: LETTER_QUIZZES().map((q) => ({
    id: q.id, title: q.title, size: () => q.letters.length, sizeLabel: 'letters', build: (ctx: Ctx) => letterQuiz(q.letters, ctx),
  })),
  quizBlurb: 'Every letter once, mixed question types, no hints, score at the end.',
  review: {
    blurb: 'Mixed review of every letter you have learned, due ones first.',
    available: (ctx) => knownLetters(ctx).size > 0,
    build: (ctx) => letterLesson('review', ctx),
  },
  badge: (ctx) => `${knownLetters(ctx).size}/${JAMO.length} letters`,
  owns: (k) => !!JAMO_BY[k] || !!WORD_BY[k],
  reference: { label: 'Chart', Component: Chart },
  footnote: KEYS_HELP,
});

const vocabLevel = (id: string, title: string): LevelDef => ({
  id,
  title,
  units: VOCAB_UNITS.map((u) => ({
    id: u.id,
    title: u.title,
    preview: u.words.map((w) => w.ko).join(' · '),
    small: true,
    count: (ctx: Ctx) => `${u.words.filter((w) => ctx.progress.stats[vkey(w.ko)]).length}/${u.words.length}`,
    build: (ctx: Ctx) => vocabLesson(u.id, ctx),
    quiz: { id: `v:${u.id}`, build: (ctx: Ctx) => vocabQuiz(u.id, ctx) },
  })),
  quizzes: [
    { id: 'v:learned', title: 'Learned words', size: (ctx) => vocabQuizWords('learned', ctx).length, sizeLabel: 'words', build: (ctx) => vocabQuiz('learned', ctx) },
    { id: 'v:all', title: 'Every word', size: () => VOCAB.length, sizeLabel: 'words', build: (ctx) => vocabQuiz('all', ctx) },
  ],
  quizBlurb: 'Every word tested three ways: matching it to its meaning, hearing it and writing it. Scored per skill. Each unit also has its own quiz.',
  review: {
    blurb: 'Mixed review of the words from units you have started, due ones first.',
    available: (ctx) => knownVocab(ctx).length > 0,
    build: (ctx) => vocabLesson(VOCAB_REVIEW, ctx),
  },
  badge: (ctx) => `${VOCAB.filter((w) => ctx.progress.stats[vkey(w.ko)]?.ok).length}/${VOCAB.length} words`,
  owns: (k) => k.startsWith('v:'),
  reference: { label: 'Word list', Component: WordList },
  footnote: `${KEYS_HELP} When writing, type on a QWERTY keyboard as if it were a Korean one (r = ㄱ, k = ㅏ, …) or use the keys on screen.`,
});

function grammarPreview(u: typeof GRAMMAR_UNITS[number]) {
  if (u.type === 'conj') return u.items.map((id) => CONJ_BY[id].dict).join(' · ');
  if (u.type === 'order') return u.items.slice(0, 3).map((id) => id.slice(2)).join(' · ');
  if (u.type === 'forms') return u.items.slice(0, 4).map((id) => { const { kind, dict } = parseFormId(id); return FORMS_BY[dict][kind]; }).join(' · ');
  return Array.from(new Set(u.items.map((id) => CLOZE_BY[id].particle))).join(' ');
}

const grammarLevel = (id: string, title: string): LevelDef => {
  const all = GRAMMAR_UNITS.flatMap((u) => u.items);
  return {
    id,
    title,
    units: GRAMMAR_UNITS.map((u) => ({
      id: u.id,
      title: u.title,
      preview: grammarPreview(u),
      small: true,
      count: (ctx: Ctx) => `${u.items.filter((i) => ctx.progress.stats[i]).length}/${u.items.length}`,
      build: (ctx: Ctx) => grammarLesson(u.id, ctx),
      quiz: { id: `g:${u.id}`, build: (ctx: Ctx) => grammarQuiz(u.id, ctx) },
    })),
    quizzes: [
      { id: 'g:started', title: 'Started units', size: (ctx) => grammarQuizItems('started', ctx).length, sizeLabel: 'questions', build: (ctx) => grammarQuiz('started', ctx) },
      { id: 'g:all', title: 'Everything', size: () => all.length, sizeLabel: 'questions', build: (ctx) => grammarQuiz('all', ctx) },
    ],
    quizBlurb: 'Every particle blank, every sentence to reorder, every verb to conjugate (typed). Each unit also has its own quiz.',
    review: {
      blurb: 'Mixed review of the units you have started, due items first.',
      available: (ctx) => startedGrammar(ctx).length > 0,
      build: (ctx) => grammarLesson('g-review', ctx),
    },
    badge: (ctx) => `${all.filter((i) => ctx.progress.stats[i]?.ok).length}/${all.length} items`,
    owns: (k) => /^(p|pt|o|c|cf|t):/.test(k),
    reference: { label: 'Grammar notes', Component: GrammarNotes },
    footnote: KEYS_HELP,
  };
};

// ---------------------------------------------------------------------------
// Summaries and the confusion list
// ---------------------------------------------------------------------------

function describe(k: string): Described | null {
  if (k.startsWith('v:')) {
    const v = VOCAB_BY[k.slice(2)];
    return v ? { glyph: v.ko, top: v.rom, bottom: v.en, audio: v.ko } : null;
  }
  if (k.startsWith('pt:')) {
    const p = PARTICLES[k.slice(3)];
    return p ? { glyph: k.slice(3), bottom: p.use, size: 'lg' } : null;
  }
  if (k.startsWith('cf:')) {
    const form = k.slice(3);
    const conj = Object.values(CONJ_BY).find((x) => x.polite === form || x.wrong.includes(form));
    if (conj) {
      return conj.polite === form
        ? { glyph: form, bottom: `polite form of ${conj.dict}`, audio: form }
        : { glyph: form, bottom: `not a word: the polite form of ${conj.dict} is ${conj.polite}` };
    }
    const f = Object.values(FORMS_BY).find((x) => [x.past, x.future, x.prog, x.neg, x.negji].includes(form));
    return f ? { glyph: form, bottom: `a form of ${f.dict}`, audio: form } : { glyph: form, bottom: 'not a correct form' };
  }
  if (k.startsWith('t:')) {
    const { kind, dict } = parseFormId(k);
    const form = FORMS_BY[dict]?.[kind];
    return form ? { glyph: `${dict} → ${form}`, bottom: kind === 'prog' ? 'right now' : kind === 'negji' ? 'negative (지 않아요)' : kind === 'neg' ? 'negative (안)' : kind, audio: form } : null;
  }
  if (k.startsWith('p:')) {
    const c = CLOZE_BY[k];
    return c ? { glyph: c.sentence.ko, top: c.particle, bottom: c.sentence.en, audio: c.sentence.ko, size: 'sm' } : null;
  }
  if (k.startsWith('o:')) {
    const sn = SENTENCE_BY[k.slice(2)];
    return sn ? { glyph: sn.ko, bottom: sn.en, audio: sn.ko, size: 'sm' } : null;
  }
  if (k.startsWith('c:')) {
    const c = CONJ_BY[k];
    return c ? { glyph: `${c.dict} → ${c.polite}`, bottom: CONJ_RULES[c.rule], audio: c.polite } : null;
  }
  const j = JAMO_BY[k];
  if (j) return { glyph: k, top: j.rom, bottom: j.hint, audio: soundOf(k), size: 'lg' };
  const w = WORD_BY[k];
  return w ? { glyph: w.ko, top: w.rom, bottom: w.en, audio: w.ko } : null;
}

export const KOREAN: LanguageModule = {
  init(data) {
    initAlphabet(data.alphabet);
    initStrokes(data.strokes);
    initVocab(data.vocab);
    initGrammar(data.grammar);
  },
  levels: { alphabet: alphabetLevel, vocab: vocabLevel, grammar: grammarLevel },
  compose: composeKeys,
  normalize,
  describe,
  drill,
};
