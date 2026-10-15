// Hangul letters (jamo), level 1 units and the words readable with them.
// Data: data/alphabet.json in the pack folder, loaded by initAlphabet.

export type JamoKind = 'consonant' | 'vowel';

export interface Jamo {
  ch: string;
  rom: string;
  kind: JamoKind;
  group: string;
  hint: string;
  final?: string;   // romanization as a final consonant (batchim)
  say: string;      // what is played for it: consonant + ㅏ (가), ㅇ + vowel (아), or an override
  sayNote: string;
}

export interface Unit {
  id: string;
  title: string;
  letters: string[];
}

export interface Word {
  ko: string;
  rom: string;
  en: string;
}

export interface AlphabetData {
  jamo: Jamo[];
  groups: string[];
  similar: string[];       // letters easy to confuse, used first as wrong choices
  homophones: string[];    // vowels that sound alike, never offered together by ear
  letterNames: Record<string, string>;
  units: { id: string; title: string; letters: string }[];
  words: Word[];           // readable with the letters, no final consonants
}

export let JAMO: Jamo[] = [];
export let JAMO_BY: Record<string, Jamo> = {};
export let GROUPS: string[] = [];
export let SIMILAR: string[] = [];
export let HOMOPHONES: string[] = [];
export let LETTER_NAMES: Record<string, string> = {};
export let UNITS: Unit[] = [];
export let WORDS: Word[] = [];
export let WORD_BY: Record<string, Word> = {};
export const WORDS_UNIT = 'words';

export function initAlphabet(d: AlphabetData) {
  JAMO = d.jamo;
  JAMO_BY = Object.fromEntries(JAMO.map((j) => [j.ch, j]));
  GROUPS = d.groups;
  SIMILAR = d.similar;
  HOMOPHONES = d.homophones;
  LETTER_NAMES = d.letterNames;
  UNITS = d.units.map((u) => ({ ...u, letters: Array.from(u.letters) }));
  WORDS = d.words;
  WORD_BY = Object.fromEntries(WORDS.map((w) => [w.ko, w]));
}

// Unicode order of the leading consonants and vowels, used to build and split
// syllables (가 = 0xAC00 + (lead * 21 + vowel) * 28 + tail).
export const LEADS = Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
export const VOWELS = Array.from('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ');

export const soundOf = (ch: string) => JAMO_BY[ch].say;

export const homophones = (a: string, b: string) => HOMOPHONES.some((h) => h.includes(a) && h.includes(b));

// Jamo of a word without final consonants.
export const jamoOf = (word: string): string[] =>
  Array.from(word).flatMap((s) => {
    const c = s.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return [];
    return [LEADS[Math.floor(c / 588)], VOWELS[Math.floor((c % 588) / 28)]];
  });
