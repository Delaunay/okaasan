// Level 2 vocabulary (data/vocab.json): words, example sentences and
// translations grouped by topic.

export interface Vocab {
  ko: string;
  rom: string;
  en: string;
  ex?: { ko: string; rom: string; en: string };
}

export interface VocabUnit {
  id: string;
  title: string;
  words: Vocab[];
}

export let VOCAB_UNITS: VocabUnit[] = [];
export let VOCAB: Vocab[] = [];
export let VOCAB_BY: Record<string, Vocab> = {};
export const VOCAB_REVIEW = 'v-review';
export const NEW_WORDS_PER_LESSON = 5;

export function initVocab(d: { units: VocabUnit[] }) {
  VOCAB_UNITS = d.units;
  VOCAB = VOCAB_UNITS.flatMap((u) => u.words);
  VOCAB_BY = Object.fromEntries(VOCAB.map((w) => [w.ko, w]));
}

// Several words share a meaning (매우 / 아주 = very): they are never offered
// against each other, and either one is accepted when writing.
export const synonyms = (a: string, b: string) => VOCAB_BY[a].en === VOCAB_BY[b].en;
export const normalize = (s: string) => s.replace(/[\s?!.,~]/g, '');

// Stats keys: vocabulary is kept apart from the level 1 reading words.
export const vkey = (ko: string) => `v:${ko}`;
