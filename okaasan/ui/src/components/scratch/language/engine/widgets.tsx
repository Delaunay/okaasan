import { createContext, useContext, useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, HStack, Text, VStack } from '@chakra-ui/react';
import { Delete, GraduationCap, Play, Star, Volume2 } from 'lucide-react';
import type { Described, Keyboard, LanguagePack, MatchPair, Skill, Stat } from './types';
import { SKILL_LABEL } from './types';
import { shuffle } from './util';

export type Status = 'idle' | 'right' | 'wrong';

interface TrainerContextValue {
  pack: LanguagePack;
  speak: (text: string | undefined) => void;
}

export const TrainerContext = createContext<TrainerContextValue | null>(null);

export function useTrainer() {
  const v = useContext(TrainerContext);
  if (!v) throw new Error('useTrainer outside a LanguageTrainer');
  return v;
}

// Font size for text in the target script, by length.
export function scriptSize(text: string, sizes: [string, string, string, string]) {
  const n = Array.from(text).length;
  return n <= 1 ? sizes[0] : n <= 3 ? sizes[1] : n <= 6 ? sizes[2] : sizes[3];
}

export function masteryTone(s: Stat | undefined) {
  if (!s || s.ok === 0) return { bg: 'var(--card-bg)', border: 'var(--border-color)', color: 'var(--muted-text)' };
  if (s.ok >= 5 && s.ok / (s.ok + s.bad) >= 0.8) return { bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)', color: 'var(--panel-green-text)' };
  return { bg: 'var(--panel-orange-bg)', border: 'var(--panel-orange-border)', color: 'var(--panel-orange-text)' };
}

export function SpeakButton({ text, big }: { text: string; big?: boolean }) {
  const { speak } = useTrainer();
  return (
    <Box
      as="button"
      onClick={() => speak(text)}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      w={big ? '96px' : '36px'}
      h={big ? '96px' : '36px'}
      borderRadius="xl"
      bg="var(--panel-blue-bg)"
      border="2px solid"
      borderColor="var(--panel-blue-border)"
      color="var(--panel-blue-text)"
      _hover={{ filter: 'brightness(1.05)' }}
      title="Play sound (space)"
    >
      <Volume2 size={big ? 44 : 18} />
    </Box>
  );
}

// Tap the pairs. Reports every pair once all are matched; a pair counts as
// missed if either side was part of a wrong attempt.
export function MatchBoard({ pairs, onDone }: {
  pairs: MatchPair[];
  onDone: (results: { key: string; ok: boolean }[], confused: [string, string][]) => void;
}) {
  const { pack, speak } = useTrainer();
  const left = useMemo(() => shuffle(pairs), [pairs]);
  const right = useMemo(() => shuffle(pairs), [pairs]);
  const [pickL, setPickL] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [confused, setConfused] = useState<[string, string][]>([]);
  const [flash, setFlash] = useState<[string, string] | null>(null);

  const attempt = (l: string | null, r: string | null) => {
    if (!l || !r) return;
    setPickL(null);
    setPickR(null);
    if (l === r) {
      const done = [...matched, l];
      setMatched(done);
      if (done.length === pairs.length) {
        setTimeout(() => onDone(pairs.map((p) => ({ key: p.id, ok: !missed.includes(p.id) })), confused), 300);
      }
      return;
    }
    setMissed((m) => Array.from(new Set([...m, l, r])));
    setConfused((c) => [...c, [l, r]]);
    setFlash([l, r]);
    setTimeout(() => setFlash(null), 500);
  };

  const tile = (p: MatchPair, side: 'L' | 'R') => {
    const isMatched = matched.includes(p.id);
    const isPicked = side === 'L' ? pickL === p.id : pickR === p.id;
    const isFlash = !!flash && (side === 'L' ? flash[0] === p.id : flash[1] === p.id);
    let tone = { bg: 'var(--card-bg)', border: 'var(--border-color)', color: 'var(--heading-color)' };
    if (isMatched) tone = { bg: 'var(--panel-green-bg)', border: 'var(--panel-green-border)', color: 'var(--panel-green-text)' };
    else if (isFlash) tone = { bg: 'var(--panel-red-bg)', border: 'var(--panel-red-border)', color: 'var(--panel-red-text)' };
    else if (isPicked) tone = { bg: 'var(--panel-blue-bg)', border: 'var(--panel-blue-border)', color: 'var(--panel-blue-text)' };
    return (
      <Box
        key={`${side}${p.id}`}
        as="button"
        onClick={() => {
          if (isMatched) return;
          if (side === 'L') {
            speak(p.audio);
            setPickL(p.id);
            attempt(p.id, pickR);
          } else {
            setPickR(p.id);
            attempt(pickL, p.id);
          }
        }}
        minH="52px" px={3} py={2} borderRadius="lg" border="2px solid" borderBottomWidth="4px"
        bg={tone.bg} borderColor={tone.border} color={tone.color}
        opacity={isMatched ? 0.55 : 1}
        fontFamily={side === 'L' ? pack.font : undefined}
        fontSize={side === 'L' ? (Array.from(p.left).length > 4 ? '18px' : '22px') : '15px'}
        fontWeight={600}
        transition="all 0.15s"
      >
        {side === 'L' ? p.left : p.right}
      </Box>
    );
  };

  return (
    <Grid templateColumns="1fr 1fr" gap={3}>
      <VStack gap={2} align="stretch">{left.map((p) => tile(p, 'L'))}</VStack>
      <VStack gap={2} align="stretch">{right.map((p) => tile(p, 'R'))}</VStack>
    </Grid>
  );
}

export function OrderBox({ tokens, bank, built, status, onAdd, onRemove }: {
  tokens: string[];
  bank: number[];
  built: number[];
  status: Status;
  onAdd: (i: number) => void;
  onRemove: (pos: number) => void;
}) {
  const { pack } = useTrainer();
  const chip = (i: number, onClick: () => void, faded = false) => (
    <Box
      key={i} as="button" onClick={() => status === 'idle' && onClick()}
      px={3} py={1} borderRadius="lg" border="2px solid" borderBottomWidth="4px" borderColor="var(--border-color)"
      bg="var(--card-bg)" color="var(--heading-color)" fontFamily={pack.font} fontSize="20px"
      opacity={faded ? 0.25 : 1} pointerEvents={faded ? 'none' : undefined}
    >
      {tokens[i]}
    </Box>
  );
  const tone = status === 'right' ? 'var(--panel-green-border)' : status === 'wrong' ? 'var(--panel-red-border)' : 'var(--border-color)';
  return (
    <VStack gap={4} align="stretch">
      <Flex minH="64px" gap={2} wrap="wrap" align="center" p={2} borderBottom="2px solid" borderColor={tone}>
        {built.map((i, pos) => chip(i, () => onRemove(pos)))}
      </Flex>
      <Flex gap={2} wrap="wrap" justify="center">
        {bank.map((i) => chip(i, () => onAdd(i), built.includes(i)))}
      </Flex>
    </VStack>
  );
}

// On-screen keyboard for the target script; physical keys are handled by the
// lesson through the same keyboard map.
export function WriteBox({ keyboard, keys, status, onKey, onBack }: {
  keyboard: Keyboard;
  keys: string[];
  status: Status;
  onKey: (k: string) => void;
  onBack: () => void;
}) {
  const { pack } = useTrainer();
  const [shift, setShift] = useState(false);
  const text = keyboard.compose(keys);
  const tone = status === 'right' ? 'var(--panel-green-text)' : status === 'wrong' ? 'var(--panel-red-text)' : 'var(--heading-color)';
  const press = (k: string) => {
    if (status !== 'idle') return;
    onKey(k);
    setShift(false);
  };
  const keyStyle = {
    minW: { base: '28px', sm: '40px' },
    h: '44px',
    px: 1,
    borderRadius: 'md',
    border: '1px solid',
    borderColor: 'var(--border-color)',
    borderBottomWidth: '3px',
    bg: 'var(--card-bg)',
    color: 'var(--heading-color)',
    fontFamily: pack.font,
    fontSize: '18px',
    _active: { transform: 'translateY(1px)' },
  } as const;
  const hasShift = keyboard.rows.some((row) => Array.from(row).some((c) => keyboard.map[c.toUpperCase()] && c.toUpperCase() !== c));

  return (
    <VStack gap={3} align="stretch">
      <Flex
        minH="72px" align="center" justify="center" px={4} borderRadius="xl" border="2px solid"
        borderColor={status === 'idle' ? 'var(--panel-blue-border)' : tone}
        bg="var(--input-bg)" fontFamily={pack.font} fontSize="40px" color={tone} wrap="wrap"
      >
        {text || <Text as="span" fontSize="md" color="var(--muted-text)" fontFamily="body">type with the keys below or your keyboard</Text>}
        {status === 'idle' && <Box as="span" w="2px" h="40px" bg="var(--panel-blue-text)" ml={1} style={{ animation: 'lt-blink 1s step-end infinite' }} />}
      </Flex>
      <VStack gap={1}>
        {keyboard.rows.map((row, r) => (
          <HStack key={row} gap={1} justify="center">
            {r === keyboard.rows.length - 1 && hasShift && (
              <Box as="button" {...keyStyle} fontFamily="body" fontSize="xs" px={2}
                bg={shift ? 'var(--panel-blue-bg)' : 'var(--card-bg)'} onClick={() => setShift(!shift)}>Shift</Box>
            )}
            {Array.from(row).map((c) => {
              const sym = (shift && keyboard.map[c.toUpperCase()]) || keyboard.map[c];
              return (
                <Box key={c} as="button" {...keyStyle} onClick={() => press(sym)} title={c} position="relative">
                  {sym}
                  <Text as="span" position="absolute" bottom="1px" right="3px" fontSize="9px" color="var(--muted-text)" fontFamily="body">{c}</Text>
                </Box>
              );
            })}
            {r === keyboard.rows.length - 1 && (
              <Box as="button" {...keyStyle} px={2} onClick={() => status === 'idle' && onBack()} title="Backspace"><Delete size={16} /></Box>
            )}
          </HStack>
        ))}
        <Box as="button" {...keyStyle} w="60%" fontFamily="body" fontSize="xs" onClick={() => press(' ')}>space</Box>
      </VStack>
      {keyboard.hint && <Text fontSize="xs" color="var(--muted-text)" textAlign="center">{keyboard.hint}</Text>}
    </VStack>
  );
}

export function DescribedItem({ d, tone = 'red', skills }: { d: Described; tone?: 'red' | 'plain'; skills?: Skill[] }) {
  const { pack, speak } = useTrainer();
  const size = d.size === 'lg' ? '32px' : d.size === 'sm' ? '15px' : '22px';
  return (
    <HStack as="button" onClick={() => speak(d.audio)} gap={3} p={2} borderRadius="lg" border="1px solid"
      borderColor={tone === 'red' ? 'var(--panel-red-border)' : 'var(--border-color)'}
      bg={tone === 'red' ? 'var(--panel-red-bg)' : 'var(--card-bg)'} textAlign="left">
      <Text fontSize={size} lineHeight={1.2} fontFamily={pack.font} color="var(--heading-color)" flexShrink={d.size === 'sm' ? 1 : 0}>{d.glyph}</Text>
      <VStack align="start" gap={0} minW={0}>
        {d.top && <Text fontWeight={700} color={tone === 'red' ? 'var(--panel-red-text)' : 'var(--panel-blue-text)'} fontFamily={pack.font}>{d.top}</Text>}
        {d.bottom && <Text fontSize="xs" color="var(--muted-text)" lineClamp={3}>{d.bottom}</Text>}
        {skills && skills.length > 0 && (
          <Text fontSize="10px" color="var(--muted-text)">missed: {skills.map((x) => SKILL_LABEL[x].toLowerCase()).join(', ')}</Text>
        )}
      </VStack>
    </HStack>
  );
}

export function UnitCard({ title, preview, done, index, small, perUnit, onStart, onQuiz }: {
  title: string;
  preview: string;
  done: number;
  index: number;
  small?: boolean;
  perUnit: number;
  onStart: () => void;
  onQuiz?: () => void;
}) {
  const { pack } = useTrainer();
  const complete = done >= perUnit;
  return (
    <Flex
      align="center"
      gap={4}
      p={4}
      borderRadius="xl"
      border="2px solid"
      borderBottomWidth="4px"
      borderColor={complete ? 'var(--panel-green-border)' : 'var(--panel-blue-border)'}
      bg="var(--card-bg)"
      ml={{ base: 0, md: `${[0, 40, 80, 40][index % 4]}px` }}
    >
      <Flex
        w="48px" h="48px" borderRadius="full" align="center" justify="center" flexShrink={0}
        bg={complete ? 'var(--panel-green-bg)' : 'var(--panel-blue-bg)'}
        color={complete ? 'var(--panel-green-text)' : 'var(--panel-blue-text)'}
      >
        {complete ? <Star size={22} /> : <Text fontWeight={700}>{index + 1}</Text>}
      </Flex>
      <Box flex={1} minW={0}>
        <Text fontWeight={700} color="var(--heading-color)">{title}</Text>
        <Box fontSize={small ? '16px' : '22px'} fontFamily={pack.font} color="var(--muted-text)" letterSpacing={small ? undefined : '0.15em'} truncate>{preview}</Box>
        <HStack gap={1} mt={1}>
          {Array.from({ length: perUnit }, (_, k) => (
            <Box key={k} w="18px" h="5px" borderRadius="full" bg={k < done ? 'var(--panel-green-text)' : 'var(--border-color)'} />
          ))}
          {done > perUnit && <Text fontSize="xs" color="var(--muted-text)" ml={1}>×{done}</Text>}
        </HStack>
      </Box>
      <VStack gap={1} align="stretch">
        <Button size="sm" colorPalette={done === 0 ? 'blue' : 'green'} variant={done === 0 ? 'solid' : 'outline'} onClick={onStart}>
          <Play size={14} /> {done === 0 ? 'Start' : 'Practice'}
        </Button>
        {onQuiz && (
          <Button size="xs" colorPalette="purple" variant="ghost" onClick={onQuiz}>
            <GraduationCap size={12} /> Quiz
          </Button>
        )}
      </VStack>
    </Flex>
  );
}
