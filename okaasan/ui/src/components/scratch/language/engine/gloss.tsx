// Sentences shown word by word (data/gloss.json): the sentence in the target
// script, a literal translation that keeps its word order, and the real
// translation, every part coloured by its part of speech so patterns stand out
// (verb last, particles after the noun they mark, …). Hovering or tapping a
// part highlights it in all three lines. Sentences without a gloss are shown
// plain.
import { useState, type MouseEvent } from 'react';
import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import type { Example, GlossPos, Glosses } from './types';
import { useTrainer } from './widgets';

// Font sizes: sentence, literal line and romanization, translation.
const SIZES = {
  sm: ['sm', 'xs', 'xs'],
  md: ['md', 'xs', 'sm'],
  lg: ['lg', 'xs', 'sm'],
} as const;

export const posColor = (c: string) => (c === 'muted' ? 'var(--muted-text)' : `var(--panel-${c}-text)`);
const posBg = (c: string) => (c === 'muted' ? 'var(--surface-muted)' : `var(--panel-${c}-bg)`);

interface Part {
  text: string;
  attach: boolean;      // no space before it
  pos: GlossPos;
  lit: string;
  en?: string;
}

const stripParens = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();

function parts(text: string, gloss: Glosses): Part[] | null {
  const segs = gloss.sentences[text];
  if (!segs) return null;
  return segs.map(([t, p, lit, en]) => {
    const pos = gloss.pos[p] ?? { label: p, color: 'muted' };
    return {
      text: t.replace(/^-/, ''),
      attach: t.startsWith('-'),
      pos,
      lit: lit ?? pos.label,
      en: en ?? (pos.tag ? undefined : stripParens(lit ?? '')),
    };
  });
}

// Where each part's words are in the translation: the first unused match,
// ignoring case, on word boundaries where the words start or end with a letter.
function spans(en: string, ps: Part[]): { text: string; part?: number }[] {
  const low = en.toLowerCase();
  const isWord = (c: string) => /[\p{L}\p{N}]/u.test(c);
  const found: [number, number, number][] = [];
  ps.forEach((p, k) => {
    if (!p.en) return;
    const n = p.en.toLowerCase();
    for (let i = low.indexOf(n); i >= 0; i = low.indexOf(n, i + 1)) {
      const j = i + n.length;
      if (found.some(([a, b]) => i < b && a < j)) continue;
      if (isWord(n[0]) && i > 0 && isWord(low[i - 1])) continue;
      if (isWord(n[n.length - 1]) && j < low.length && isWord(low[j])) continue;
      found.push([i, j, k]);
      break;
    }
  });
  found.sort((a, b) => a[0] - b[0]);
  const out: { text: string; part?: number }[] = [];
  let at = 0;
  for (const [i, j, k] of found) {
    if (i > at) out.push({ text: en.slice(at, i) });
    out.push({ text: en.slice(i, j), part: k });
    at = j;
  }
  if (at < en.length) out.push({ text: en.slice(at) });
  return out;
}

export function Sentence({ ex, size = 'md' }: { ex: Example; size?: keyof typeof SIZES }) {
  const { pack } = useTrainer();
  const [active, setActive] = useState<number | null>(null);
  const [koSize, smallSize, enSize] = SIZES[size];
  const ps = pack.gloss && parts(ex.text, pack.gloss);

  if (!ps) {
    return (
      <VStack align="start" gap={0}>
        <Text fontFamily={pack.font} fontSize={koSize} color="var(--heading-color)">{ex.text}</Text>
        {ex.rom && <Text fontSize={smallSize} color="var(--muted-text)">{ex.rom}</Text>}
        <Text fontSize={enSize} color="var(--muted-text)" fontStyle="italic">{ex.en}</Text>
      </VStack>
    );
  }

  const mark = (k: number) => ({
    title: `${ps[k].pos.label}: ${ps[k].lit}`,
    onMouseEnter: () => setActive(k),
    onMouseLeave: () => setActive(null),
    onClick: (e: MouseEvent) => { e.stopPropagation(); setActive((a) => (a === k ? null : k)); },
    borderRadius: 'sm',
    bg: active === k ? posBg(ps[k].pos.color) : undefined,
    outline: active === k ? `1px solid ${posColor(ps[k].pos.color)}` : undefined,
    cursor: 'pointer',
  });

  return (
    <VStack align="start" gap={0.5}>
      <Text fontFamily={pack.font} fontSize={koSize} lineHeight={1.6}>
        {ps.map((p, k) => (
          <span key={k}>
            {k > 0 && !p.attach && ' '}
            <Box as="span" {...mark(k)} color={posColor(p.pos.color)} fontWeight={p.pos.tag ? 400 : 600}>{p.text}</Box>
          </span>
        ))}
      </Text>
      {ex.rom && <Text fontSize={smallSize} color="var(--muted-text)">{ex.rom}</Text>}
      <Text fontSize={smallSize} lineHeight={1.9}>
        <Text as="span" color="var(--muted-text)" mr={1} title="Word for word, in the sentence's own order">lit.</Text>
        {ps.map((p, k) => (
          <span key={k}>
            {k > 0 && ' '}
            {p.pos.tag ? (
              <Box as="span" {...mark(k)} px={1} py="1px" whiteSpace="nowrap"
                bg={posBg(p.pos.color)} color={posColor(p.pos.color)} border="1px solid" borderColor={posColor(p.pos.color)}
                fontSize="0.85em" outline={active === k ? `2px solid ${posColor(p.pos.color)}` : undefined}>
                {p.lit}
              </Box>
            ) : (
              <Box as="span" {...mark(k)} color={posColor(p.pos.color)} fontWeight={600}>{p.lit}</Box>
            )}
          </span>
        ))}
      </Text>
      <Text fontSize={enSize} fontStyle="italic" color="var(--muted-text)">
        {spans(ex.en, ps).map((s, i) => (s.part === undefined
          ? <span key={i}>{s.text}</span>
          : <Box as="span" key={i} {...mark(s.part)} color={posColor(ps[s.part].pos.color)} fontWeight={600}>{s.text}</Box>
        ))}
      </Text>
    </VStack>
  );
}

// One entry per colour: the parts of speech sharing it.
export function GlossLegend() {
  const { pack } = useTrainer();
  if (!pack.gloss) return null;
  const byColor = new Map<string, { tag: boolean; names: string[] }>();
  for (const p of Object.values(pack.gloss.pos)) {
    const name = p.tag && p.color === 'teal' ? 'particle' : p.label.replace(/\s*\(.*\)$/, '');
    const e = byColor.get(p.color) ?? { tag: !!p.tag, names: [] };
    if (!e.names.includes(name)) e.names.push(name);
    if (!p.tag) e.tag = false;
    byColor.set(p.color, e);
  }
  return (
    <Box p={3} borderRadius="lg" bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)">
      <HStack gap={4} wrap="wrap" fontSize="xs">
        {Array.from(byColor).map(([c, e]) => (
          <HStack key={c} gap={1}>
            <Box w="10px" h="10px" borderRadius={e.tag ? 'sm' : 'full'} bg={posColor(c)} />
            <Text color={posColor(c)} fontWeight={600}>{e.names.join(', ')}</Text>
          </HStack>
        ))}
      </HStack>
      <Text fontSize="xs" color="var(--muted-text)" mt={2}>
        Each sentence is followed by a word-for-word line (lit.) that keeps its order, then the translation in the same colours.
        Small boxes are grammar pieces (particles, endings) that English expresses with word order or prepositions.
        Hover or tap a word to find it in every line.
      </Text>
    </Box>
  );
}
