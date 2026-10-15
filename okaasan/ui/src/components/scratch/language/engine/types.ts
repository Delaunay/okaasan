// The contract between the language-independent trainer and a language pack.
//
// A pack owns its data and turns it into generic exercises (choice, write,
// order, draw, match, ...). The engine runs lessons and quizzes, keeps
// progress, tracks which items get confused with which, and plays audio,
// without knowing anything about the language.
import type React from 'react';
import type { Stroke } from './strokes';

export type Skill = 'read' | 'listen' | 'write' | 'grammar';

export const SKILL_LABEL: Record<Skill, string> = {
  read: 'Reading', listen: 'Listening', write: 'Writing', grammar: 'Grammar',
};

export interface Stat {
  ok: number;
  bad: number;
}

export interface Progress {
  stats: Record<string, Stat>;          // per item id
  confusions: Record<string, number>;   // 'a|b' (sorted) -> times one was taken for the other
  lessons: Record<string, number>;      // unit id -> lessons completed
  xp: number;
  streak: number;
  lastDay: string;
  bestQuiz: Record<string, number>;     // quiz id -> best score in %
}

// What the learner sees above the answer area.
export interface Prompt {
  title: string;
  glyph?: string;       // large, in the target script
  text?: string;        // large, in the learner's language or romanized
  sub?: string;         // small line under the prompt (or above a cloze)
  audio?: string;       // text to speak
  audioButton?: 'big' | 'small' | 'none';  // default: big when nothing else is shown
  autoplay?: boolean;
  cloze?: { before: string; after: string };  // the blank shows the chosen option
}

export interface Option {
  key: string;          // also the key confusions are recorded under
  label: string;
  script?: boolean;     // label is in the target script
  audio?: string;       // played when the option is picked
}

export interface Feedback {
  head: string;         // in the target script, shown bold
  detail?: string;
  note?: string;
}

export interface Card {
  glyph: string;
  audio?: string;
  strokes?: Stroke[];   // stroke-order animation
  lines: { text: string; tone?: 'title' | 'body' | 'small' }[];
  example?: { text: string; rom?: string; en: string };
}

export interface MatchPair {
  id: string;           // item id, also its confusion key
  left: string;         // target script
  right: string;
  audio?: string;
}

interface Graded {
  id: string;
  skill: Skill;
  prompt: Prompt;
  feedback: Feedback;
  audioAfter?: string;  // spoken once answered (default: the prompt audio)
}

export type Ex =
  | { kind: 'card'; card: Card }
  | { kind: 'rule'; title: string; text: string }
  | (Graded & { kind: 'choice'; options: Option[]; answer: string })
  | (Graded & { kind: 'write'; accept: string[] })
  | (Graded & { kind: 'order'; tokens: string[] })
  | (Graded & { kind: 'draw'; variants: Stroke[][]; guided: boolean })
  | { kind: 'match'; pairs: MatchPair[] };

export interface Answer {
  key: string;
  ok: boolean;
  skill?: Skill;
}

export interface SoundPack {
  id: string;
  label: string;
  names?: boolean;      // letter clips say the letter's name
}

// Everything a pack needs to build exercises for the current learner.
export interface Ctx {
  progress: Progress;
  canListen: boolean;
  soundPack: SoundPack;
  // Higher for items answered wrong often, seen rarely, or often confused.
  weakness(id: string): number;
  // Keys this one has been taken for, most often first.
  confusedWith(key: string): string[];
}

export interface Keyboard {
  rows: string[];                   // physical keys, one string per row
  map: Record<string, string>;      // key, or upper case for shift -> symbol
  compose(keys: string[]): string;  // symbols typed so far -> text
  hint?: string;
}

// How an item or option key is shown in summaries and the confusion list.
export interface Described {
  glyph: string;
  top?: string;
  bottom?: string;
  audio?: string;
  size?: 'lg' | 'md' | 'sm';
}

export interface UnitDef {
  id: string;
  title: string;
  preview: string;
  small?: boolean;                  // preview is words rather than letters
  count?: (ctx: Ctx) => string;     // e.g. '3/10' items seen
  build(ctx: Ctx): Ex[];
  quiz?: { id: string; build(ctx: Ctx): Ex[] };
}

export interface QuizDef {
  id: string;
  title: string;
  size(ctx: Ctx): number;
  sizeLabel: string;                // 'letters', 'words', 'questions'
  build(ctx: Ctx): Ex[];
}

export interface LevelDef {
  id: string;
  title: string;
  units: UnitDef[];
  quizzes: QuizDef[];
  quizBlurb: string;
  review?: { blurb: string; available(ctx: Ctx): boolean; build(ctx: Ctx): Ex[] };
  badge(ctx: Ctx): string;
  owns(key: string): boolean;       // for the per-level confusion list
  reference?: { label: string; Component: React.ComponentType<{ ctx: Ctx }> };
  footnote?: string;
}

export interface LanguagePack {
  id: string;
  name: string;
  nativeName: string;
  font: string;
  storage: { collection: string; key: string; local: string };
  audio: { base: string; lang: string; preview: string };
  keyboard: Keyboard;
  normalize(s: string): string;
  levels: LevelDef[];
  describe(key: string): Described | null;
  // Exercises that put the given keys against each other.
  drill?(keys: string[], ctx: Ctx): Ex[];
  lessonsPerUnit?: number;
}
