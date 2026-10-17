// Runs a list of exercises: lessons re-ask what was missed at the end, quizzes
// (exam) do not and end with a per-skill summary. Wrong picks are reported as
// confusions between the expected key and the one taken for it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, Grid, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { BookOpen, Check, GraduationCap, Star, X } from 'lucide-react';
import type { Answer, Card, Ex, Line, Prompt, Skill } from './types';
import { SKILL_LABEL } from './types';
import { dayStr, shuffle } from './util';
import { StrokeAnim, StrokePad } from './strokes';
import { Sentence } from './gloss';
import { DescribedItem, MatchBoard, OrderBox, SpeakButton, Status, WriteBox, scriptSize, useTrainer } from './widgets';

const TONES = {
  right: { bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)', color: 'var(--panel-green-text)' },
  wrong: { bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)', color: 'var(--panel-red-text)' },
  picked: { bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)', color: 'var(--panel-blue-text)' },
  plain: { bg: 'var(--card-bg)', border: 'var(--border-color)', color: 'var(--heading-color)' },
};

function CardView({ card, replayKey }: { card: Card; replayKey: number }) {
  const { pack } = useTrainer();
  return (
    <Flex gap={6} align="center" justify="center" wrap="wrap" py={2}>
      {card.strokes && <StrokeAnim key={replayKey} strokes={card.strokes} size={180} />}
      <VStack align={card.strokes ? 'start' : 'center'} gap={2} maxW={card.strokes ? '280px' : '100%'} w={card.strokes ? undefined : '100%'}>
        <HStack gap={3}>
          <Text fontSize={scriptSize(card.glyph, ['64px', '56px', '48px', '36px'])} lineHeight={1.1} fontFamily={pack.font} color="var(--heading-color)">{card.glyph}</Text>
          {card.audio && <SpeakButton text={card.audio} />}
        </HStack>
        {card.lines.map((l, i) => (
          <Text
            key={i}
            fontSize={l.tone === 'title' ? '2xl' : l.tone === 'small' ? 'xs' : 'md'}
            fontWeight={l.tone === 'title' ? 700 : undefined}
            color={l.tone === 'title' ? 'var(--panel-blue-text)' : l.tone === 'small' ? 'var(--muted-text)' : 'var(--heading-color)'}
            fontFamily={pack.font}
          >
            {l.text}
          </Text>
        ))}
        {card.example && (
          <HStack gap={3} p={3} borderRadius="lg" bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" align="start" w="100%">
            <SpeakButton text={card.example.text} />
            <Sentence ex={card.example} />
          </HStack>
        )}
      </VStack>
    </Flex>
  );
}

// Chat-style lines; B speaks from the right.
function Bubbles({ lines, showEn }: { lines: Line[]; showEn?: boolean }) {
  const { pack } = useTrainer();
  const first = lines[0]?.who;
  return (
    <VStack align="stretch" gap={2} w="100%">
      {lines.map((l, i) => {
        const right = l.who !== first;
        return (
          <Flex key={i} justify={right ? 'flex-end' : 'flex-start'} gap={2} align="center">
            {!right && <SpeakButton text={l.text} />}
            <Box maxW="80%" px={3} py={2} borderRadius="xl"
              bg={right ? 'var(--panel-blue-bg)' : 'var(--surface-muted)'} border="1px solid"
              borderColor={right ? 'var(--panel-blue-border)' : 'var(--border-color)'}>
              <Text fontSize="10px" fontWeight={700} color="var(--muted-text)">{l.who}</Text>
              {showEn && l.en
                ? <Sentence ex={{ text: l.text, rom: l.rom, en: l.en }} size="lg" />
                : <Text fontFamily={pack.font} fontSize="lg" color="var(--heading-color)">{l.text}</Text>}
            </Box>
            {right && <SpeakButton text={l.text} />}
          </Flex>
        );
      })}
    </VStack>
  );
}

function PromptView({ prompt, blank, status }: { prompt: Prompt; blank?: string | null; status: Status }) {
  const { pack } = useTrainer();
  const button = prompt.audioButton ?? (prompt.glyph || prompt.text || prompt.cloze || prompt.bubbles ? 'none' : 'big');
  const tone = status === 'right' ? TONES.right.color : status === 'wrong' ? TONES.wrong.color : TONES.picked.color;
  return (
    <VStack gap={2} py={1}>
      {prompt.bubbles && <Bubbles lines={prompt.bubbles} />}
      {prompt.cloze && prompt.sub && <Text fontSize="sm" color="var(--muted-text)" fontStyle="italic" textAlign="center">{prompt.sub}</Text>}
      {prompt.glyph && (
        <Text textAlign="center" fontSize={scriptSize(prompt.glyph, ['120px', '88px', '64px', '40px'])} lineHeight={1.1} fontFamily={pack.font} color="var(--heading-color)">
          {prompt.glyph}
        </Text>
      )}
      {prompt.text && (
        <HStack gap={3}>
          <Text textAlign="center" fontSize={prompt.text.length <= 4 ? '56px' : '30px'} fontWeight={700} color="var(--panel-blue-text)">{prompt.text}</Text>
          {prompt.audio && button === 'small' && <SpeakButton text={prompt.audio} />}
        </HStack>
      )}
      {prompt.audio && button === 'big' && <Box py={3}><SpeakButton text={prompt.audio} big /></Box>}
      {prompt.cloze && (
        <Text textAlign="center" fontSize="28px" lineHeight={1.6} fontFamily={pack.font} color="var(--heading-color)">
          {prompt.cloze.before}
          <Box as="span" display="inline-block" minW="2.2em" px={1} borderBottom="3px solid" borderColor={tone} color={tone} fontWeight={700}>
            {blank || ' '}
          </Box>
          {prompt.cloze.after}
        </Text>
      )}
      {!prompt.cloze && prompt.sub && <Text fontSize="sm" color="var(--muted-text)" textAlign="center">{prompt.sub}</Text>}
    </VStack>
  );
}

// Study time, counted second by second while the lesson is running, the page
// is visible and in use: a minute without a key press, click or scroll pauses
// it. Seconds are kept per day, for a lesson that runs past midnight.
const IDLE_MS = 60_000;

function useStudyClock(running: boolean) {
  const spent = useRef<Record<string, number>>({});
  const [seconds, setSeconds] = useState(0);
  const on = useRef(running);
  on.current = running;
  useEffect(() => {
    let last = Date.now();
    const poke = () => { last = Date.now(); };
    const events = ['keydown', 'pointerdown', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    const timer = setInterval(() => {
      if (!on.current || document.hidden || Date.now() - last > IDLE_MS) return;
      const d = dayStr(new Date());
      spent.current[d] = (spent.current[d] || 0) + 1;
      setSeconds((n) => n + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, poke));
    };
  }, []);
  return { spent: spent.current, seconds };
}

const clockText = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const graded = (e: Ex) => e.kind === 'choice' || e.kind === 'write' || e.kind === 'order' || e.kind === 'draw';

export function Lesson({ title, exercises, exam, onExit, onFinish }: {
  title: string;
  exercises: Ex[];
  exam?: boolean;
  onExit: (spent: Record<string, number>) => void;
  onFinish: (answers: Answer[], confusions: [string, string][], spent: Record<string, number>) => void;
}) {
  const { pack, speak } = useTrainer();
  const [queue, setQueue] = useState<Ex[]>(exercises);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [confusions, setConfusions] = useState<[string, string][]>([]);
  const [typed, setTyped] = useState<string[]>([]);
  const [built, setBuilt] = useState<number[]>([]);
  const [matchMissed, setMatchMissed] = useState<string[]>([]);
  const ex = queue[idx] as Ex | undefined;
  const clock = useStudyClock(!!ex);

  const tokens = ex?.kind === 'order' ? ex.tokens : null;
  // Shuffled chips, never in the answer's order.
  const bank = useMemo(() => {
    if (!tokens) return [];
    const ids = tokens.map((_, i) => i);
    let out = shuffle(ids);
    for (let t = 0; t < 5 && tokens.length > 1 && out.map((i) => tokens[i]).join(' ') === tokens.join(' '); t++) out = shuffle(ids);
    return out;
  }, [tokens]);

  // Sound that is the question plays on arrival.
  useEffect(() => {
    if (!ex) return;
    const audio = ex.kind === 'card' ? ex.card.audio : graded(ex) && 'prompt' in ex && ex.prompt.autoplay ? ex.prompt.audio : undefined;
    if (!audio) return;
    const t = setTimeout(() => speak(audio), 250);
    return () => clearTimeout(t);
  }, [idx, ex, speak]);

  const record = (ok: boolean, e: Ex, takenFor?: string) => {
    if (status !== 'idle' || !('id' in e)) return;
    setAnswers((a) => [...a, { key: e.id, ok, skill: e.skill, option: e.kind === 'choice' && e.answer !== e.id ? e.answer : undefined }]);
    if (takenFor && e.kind === 'choice') setConfusions((c) => [...c, [e.answer, takenFor]]);
    setStatus(ok ? 'right' : 'wrong');
    if (!ok && !exam) {
      const again: Ex = e.kind === 'choice' ? { ...e, options: shuffle(e.options) } : e.kind === 'draw' ? { ...e, guided: true } : e;
      setQueue((q) => [...q, again]);
    }
    speak(e.audioAfter ?? (e.prompt.autoplay ? undefined : e.prompt.audio));
  };

  const finishMatch = (e: Ex, results: { key: string; ok: boolean }[], confused: [string, string][]) => {
    if (status !== 'idle') return;
    setAnswers((a) => [...a, ...results.map((r) => ({ key: r.key, ok: r.ok, skill: 'read' as Skill }))]);
    setConfusions((c) => [...c, ...confused]);
    const missed = results.filter((r) => !r.ok).map((r) => r.key);
    setMatchMissed(missed);
    setStatus(missed.length ? 'wrong' : 'right');
    if (missed.length && !exam) setQueue((q) => [...q, e]);
  };

  const check = () => {
    if (!ex || status !== 'idle') return;
    if (ex.kind === 'choice' && selected) record(selected === ex.answer, ex, selected !== ex.answer ? selected : undefined);
    if (ex.kind === 'write' && typed.length) {
      const text = pack.normalize(pack.keyboard.compose(typed));
      record(ex.accept.some((a) => pack.normalize(a) === text), ex);
    }
    if (ex.kind === 'order' && built.length === ex.tokens.length) {
      record(built.map((i) => ex.tokens[i]).join(' ') === ex.tokens.join(' '), ex);
    }
  };

  const next = () => {
    setSelected(null);
    setTyped([]);
    setBuilt([]);
    setMatchMissed([]);
    setStatus('idle');
    setIdx((i) => i + 1);
  };

  const canContinue = !!ex && (ex.kind === 'card' || ex.kind === 'rule' || ex.kind === 'dialogue' || status !== 'idle');
  const canCheck = !!ex && status === 'idle' && (
    (ex.kind === 'choice' && !!selected) || (ex.kind === 'write' && typed.length > 0) || (ex.kind === 'order' && built.length === ex.tokens.length)
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ex || e.ctrlKey || e.metaKey || e.altKey) return;
      if (ex.kind === 'write' && status === 'idle') {
        const sym = pack.keyboard.map[e.key] || pack.keyboard.map[e.key.toLowerCase()];
        if (sym) { e.preventDefault(); setTyped((t) => [...t, sym]); return; }
        if (e.key === 'Backspace') { e.preventDefault(); setTyped((t) => t.slice(0, -1)); return; }
        if (e.key === ' ') { e.preventDefault(); setTyped((t) => [...t, ' ']); return; }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (canContinue) next(); else check();
      } else if (e.key === ' ') {
        e.preventDefault();
        speak(ex.kind === 'card' ? ex.card.audio : 'prompt' in ex ? ex.prompt.audio ?? ex.audioAfter : undefined);
      } else if (status === 'idle' && ex.kind === 'choice' && /^[1-4]$/.test(e.key)) {
        const o = ex.options[Number(e.key) - 1];
        if (o) setSelected(o.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress = Math.min(1, idx / queue.length);

  if (!ex && exam) {
    const wrong = answers.filter((a) => !a.ok);
    const missed = Array.from(new Set(wrong.map((a) => a.key)));
    const right = answers.length - wrong.length;
    const pct = Math.round((right / Math.max(answers.length, 1)) * 100);
    const bySkill = (Object.keys(SKILL_LABEL) as Skill[])
      .map((sk) => ({ sk, n: answers.filter((a) => a.skill === sk).length, ok: answers.filter((a) => a.skill === sk && a.ok).length }))
      .filter((x) => x.n > 0);
    return (
      <VStack gap={5} py={12} px={4} textAlign="center" maxW="640px" mx="auto">
        <GraduationCap size={56} color="var(--panel-purple-text)" />
        <Heading size="xl" color="var(--heading-color)">Quiz complete</Heading>
        <Text fontSize="5xl" fontWeight={700} color={pct >= 80 ? 'var(--panel-green-text)' : pct >= 50 ? 'var(--panel-orange-text)' : 'var(--panel-red-text)'}>
          {right}/{answers.length}
        </Text>
        <Text color="var(--muted-text)">{pct}% correct in {clockText(clock.seconds)}</Text>
        <HStack gap={3} wrap="wrap" justify="center">
          {bySkill.map(({ sk, n, ok }) => (
            <VStack key={sk} gap={0} px={4} py={2} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--surface-muted)">
              <Text fontSize="xl" fontWeight={700} color={ok === n ? 'var(--panel-green-text)' : 'var(--heading-color)'}>{ok}/{n}</Text>
              <Text fontSize="xs" color="var(--muted-text)">{SKILL_LABEL[sk]}</Text>
            </VStack>
          ))}
        </HStack>
        {missed.length > 0 ? (
          <Box w="100%">
            <Text fontSize="sm" fontWeight={600} color="var(--heading-color)" mb={2}>To work on</Text>
            <Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap={2} textAlign="left">
              {missed.map((k) => {
                const d = pack.describe(k);
                return d && (
                  <DescribedItem key={k} d={d} skills={Array.from(new Set(wrong.filter((a) => a.key === k && a.skill).map((a) => a.skill!)))} />
                );
              })}
            </Grid>
          </Box>
        ) : (
          <Text color="var(--panel-green-text)" fontWeight={600}>Perfect, no mistakes.</Text>
        )}
        <Button colorPalette="purple" size="lg" onClick={() => onFinish(answers, confusions, clock.spent)}>Done</Button>
      </VStack>
    );
  }

  if (!ex) {
    const right = answers.filter((a) => a.ok).length;
    const firstTry = exercises.filter(graded).length + exercises.filter((e) => e.kind === 'match').reduce((n, e) => n + (e.kind === 'match' ? e.pairs.length : 0), 0);
    return (
      <VStack gap={5} py={12} textAlign="center">
        <Star size={56} color="var(--panel-orange-text)" fill="var(--panel-orange-bg)" />
        <Heading size="xl" color="var(--heading-color)">Lesson complete</Heading>
        <HStack gap={6}>
          <VStack gap={0}><Text fontSize="2xl" fontWeight={700} color="var(--panel-orange-text)">+{10 + right}</Text><Text fontSize="xs" color="var(--muted-text)">XP</Text></VStack>
          <VStack gap={0}>
            <Text fontSize="2xl" fontWeight={700} color="var(--panel-green-text)">{answers.length ? Math.round((Math.min(right, firstTry) / Math.max(firstTry, 1)) * 100) : 100}%</Text>
            <Text fontSize="xs" color="var(--muted-text)">accuracy</Text>
          </VStack>
          <VStack gap={0}><Text fontSize="2xl" fontWeight={700} color="var(--panel-blue-text)">{clockText(clock.seconds)}</Text><Text fontSize="xs" color="var(--muted-text)">time</Text></VStack>
        </HStack>
        <Button colorPalette="green" size="lg" onClick={() => onFinish(answers, confusions, clock.spent)}>Continue</Button>
      </VStack>
    );
  }

  const tile = (o: { key: string; label: string; script?: boolean; audio?: string }, i: number) => {
    if (ex.kind !== 'choice') return null;
    const isSel = selected === o.key;
    const isAnswer = ex.answer === o.key;
    const tone = status !== 'idle' && isAnswer ? TONES.right : status === 'wrong' && isSel ? TONES.wrong : isSel ? TONES.picked : TONES.plain;
    return (
      <Box
        key={o.key}
        as="button"
        onClick={() => {
          if (status !== 'idle') return;
          setSelected(o.key);
          speak(o.audio);
        }}
        position="relative"
        p={4}
        minH="84px"
        borderRadius="xl"
        border="2px solid"
        borderBottomWidth="4px"
        bg={tone.bg}
        borderColor={tone.border}
        color={tone.color}
        fontFamily={o.script ? pack.font : undefined}
        fontSize={o.script ? scriptSize(o.label, ['40px', '36px', '26px', '20px']) : '20px'}
        fontWeight={600}
        transition="all 0.1s"
        _hover={status === 'idle' ? { filter: 'brightness(0.97)' } : undefined}
      >
        <Text position="absolute" top={1} left={2} fontSize="xs" color="var(--muted-text)" fontFamily="body">{i + 1}</Text>
        {o.label}
      </Box>
    );
  };

  const feedback = () => {
    if (ex.kind === 'match') {
      if (!matchMissed.length) return <>All {ex.pairs.length} pairs on the first try.</>;
      return (
        <>
          Mixed up:{' '}
          {ex.pairs.filter((p) => matchMissed.includes(p.id)).map((p, i) => (
            <span key={p.id}>{i > 0 && ', '}<b style={{ fontFamily: pack.font }}>{p.left}</b> = {p.right}</span>
          ))}
        </>
      );
    }
    if (!graded(ex) || !('feedback' in ex)) return null;
    const f = ex.feedback;
    const glossed = f.sentence && pack.gloss?.sentences[f.sentence.text];
    return (
      <>
        {ex.kind === 'write' && status === 'wrong' && typed.length > 0 && (
          <>You wrote <b style={{ fontFamily: pack.font }}>{pack.keyboard.compose(typed)}</b>. </>
        )}
        {glossed ? <Sentence ex={f.sentence!} size="sm" /> : <><b style={{ fontFamily: pack.font }}>{f.head}</b>{f.detail && <> · {f.detail}</>}</>}
        {f.note && !(glossed && f.note === f.sentence!.rom) && <Text as="span" display="block" fontSize="xs" color="var(--muted-text)" mt={1}>{f.note}</Text>}
      </>
    );
  };

  const blank = ex.kind === 'choice' && ex.prompt.cloze
    ? (status === 'idle' ? ex.options.find((o) => o.key === selected)?.label : ex.options.find((o) => o.key === ex.answer)?.label)
    : null;

  return (
    <Flex direction="column" minH="100%" maxW="640px" mx="auto" w="100%">
      <HStack px={4} py={3} gap={3}>
        <Box as="button" onClick={() => onExit(clock.spent)} color="var(--muted-text)" title="Quit lesson"><X size={22} /></Box>
        <Box flex={1} h="14px" bg="var(--surface-muted)" borderRadius="full" overflow="hidden">
          <Box h="100%" w={`${progress * 100}%`} bg="var(--panel-green-text)" borderRadius="full" transition="width 0.3s" />
        </Box>
        <Text fontSize="xs" color="var(--muted-text)">{title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" fontVariantNumeric="tabular-nums" title="Study time (pauses after a minute without activity)">{clockText(clock.seconds)}</Text>
      </HStack>

      <VStack flex={1} gap={5} px={4} py={4} align="stretch">
        <Heading size="md" color="var(--heading-color)">
          {ex.kind === 'card' ? 'New' : ex.kind === 'rule' ? 'Grammar note' : ex.kind === 'dialogue' ? ex.title : ex.kind === 'match' ? 'Tap the matching pairs' : ex.prompt.title}
        </Heading>

        {ex.kind === 'card' && <CardView card={ex.card} replayKey={idx} />}
        {ex.kind === 'rule' && (
          <Box p={5} borderRadius="xl" bg="var(--panel-blue-bg)" border="1px solid" borderColor="var(--panel-blue-border)">
            <HStack gap={2} mb={2} color="var(--panel-blue-text)"><BookOpen size={18} /><Text fontWeight={700}>{ex.title}</Text></HStack>
            <Text color="var(--heading-color)" fontFamily={pack.font} lineHeight={1.7}>{ex.text}</Text>
          </Box>
        )}
        {ex.kind === 'dialogue' && <Bubbles lines={ex.lines} showEn />}
        {'prompt' in ex && <PromptView prompt={ex.prompt} blank={blank} status={status} />}

        {ex.kind === 'choice' && <Grid templateColumns="1fr 1fr" gap={3}>{ex.options.map(tile)}</Grid>}
        {ex.kind === 'write' && (
          <WriteBox
            key={idx}
            keyboard={pack.keyboard}
            keys={typed}
            status={status}
            onKey={(k) => setTyped((t) => [...t, k])}
            onBack={() => setTyped((t) => t.slice(0, -1))}
          />
        )}
        {ex.kind === 'order' && (
          <OrderBox
            tokens={ex.tokens} bank={bank} built={built} status={status}
            onAdd={(i) => setBuilt((b) => [...b, i])}
            onRemove={(pos) => setBuilt((b) => b.filter((_, k) => k !== pos))}
          />
        )}
        {ex.kind === 'draw' && (
          <Flex justify="center">
            <StrokePad key={idx} variants={ex.variants} guided={ex.guided} onDone={(m) => record(m <= 1, ex)} />
          </Flex>
        )}
        {ex.kind === 'match' && <MatchBoard key={idx} pairs={ex.pairs} onDone={(r, c) => finishMatch(ex, r, c)} />}
      </VStack>

      <Box
        position="sticky"
        bottom={0}
        px={4}
        py={4}
        borderTop="2px solid"
        borderColor={status === 'right' ? TONES.right.border : status === 'wrong' ? TONES.wrong.border : 'var(--border-color)'}
        bg={status === 'right' ? TONES.right.bg : status === 'wrong' ? TONES.wrong.bg : 'var(--card-bg)'}
      >
        <Flex align="center" gap={3} wrap="wrap">
          <Box flex={1} minW="200px">
            {status !== 'idle' && (
              <>
                <HStack gap={2} color={status === 'right' ? TONES.right.color : TONES.wrong.color}>
                  {status === 'right' ? <Check size={20} /> : <X size={20} />}
                  <Text fontWeight={700}>{status === 'right' ? 'Correct!' : ex.kind === 'match' ? 'Almost!' : 'Correct answer:'}</Text>
                </HStack>
                <Box fontSize="sm" color="var(--heading-color)">{feedback()}</Box>
              </>
            )}
          </Box>
          {canContinue ? (
            <Button colorPalette={status === 'wrong' ? 'red' : 'green'} size="lg" onClick={next}>Continue</Button>
          ) : ex.kind === 'match' ? (
            <Button size="lg" disabled>Match all pairs</Button>
          ) : ex.kind === 'draw' ? (
            <Button variant="ghost" size="lg" onClick={() => record(false, ex)}>Skip</Button>
          ) : (
            <HStack gap={2}>
              {ex.kind === 'write' && <Button variant="ghost" size="lg" onClick={() => record(false, ex)}>I don't know</Button>}
              <Button colorPalette="green" size="lg" disabled={!canCheck} onClick={check}>Check</Button>
            </HStack>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}
