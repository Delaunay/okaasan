// Level 3 (grammar), from data/grammar.json: particles to fill in, sentences to
// put back in order, 이다 / 있다 / 없다, the polite 해요 form, tenses and
// negation. The units list gives the order and the kind of each unit:
//   particles: { group }        blanks whose particle belongs to that group
//   order:     { vocabUnits }   example sentences of those vocabulary units
//   conj:      { items }        dictionary form -> polite form, with wrong forms
//   forms:     { kinds }        past / future / prog / neg / negji of every verb
import { VOCAB_UNITS, Vocab } from './vocab';
import { FORMS, Forms, initForms } from './tenses';

export type Sentence = NonNullable<Vocab['ex']>;

export interface ParticleInfo {
  group: string;
  use: string;
  pair?: [string, string];  // form after a consonant / after a vowel
  confuse: string[];        // choices that look plausible next to this one
}

export interface Cloze {
  id: string;
  sentence: Sentence;
  before: string;
  after: string;
  particle: string;
}

export interface Conj {
  dict: string;
  polite: string;
  rule: string;
  wrong: string[];
}

export type FormKind = 'past' | 'future' | 'prog' | 'neg' | 'negji';

type UnitSource =
  | { type: 'particles'; group: string }
  | { type: 'order'; vocabUnits: string[] }
  | { type: 'conj'; items: Conj[] }
  | { type: 'forms'; kinds: FormKind[] };

export type GrammarUnitData = { id: string; title: string; rule: string } & UnitSource;

export interface GrammarUnit {
  id: string;
  title: string;
  rule: string;       // shown at the start of each lesson
  type: UnitSource['type'];
  items: string[];    // stats keys: p:..., o:..., c:..., t:...
}

export interface GrammarData {
  sentences: Sentence[];
  particles: Record<string, ParticleInfo>;
  cloze: string[];    // sentences with the particles to practise in [brackets]
  conjRules: Record<string, string>;
  forms: Forms[];
  units: GrammarUnitData[];
}

export let SENTENCE_BY: Record<string, Sentence> = {};
export let GRAMMAR_SENTENCES: Sentence[] = [];   // the grammar guide's own examples
export let PARTICLES: Record<string, ParticleInfo> = {};
export let CLOZES: Cloze[] = [];
export let CLOZE_BY: Record<string, Cloze> = {};
export let CONJ_RULES: Record<string, string> = {};
export let CONJ_BY: Record<string, Conj> = {};
export let CONJ_UNITS: { id: string; title: string; items: Conj[] }[] = [];
export let GRAMMAR_UNITS: GrammarUnit[] = [];
export let RULES: { title: string; text: string }[] = [];

export const orderId = (ko: string) => `o:${ko}`;
export const formId = (kind: FormKind, dict: string) => `t:${kind}:${dict}`;
export const parseFormId = (id: string) => {
  const [, kind, dict] = id.split(':');
  return { kind: kind as FormKind, dict };
};

// One blank per bracket: '나[는] 나라[가]' gives two exercises.
function parseCloze(src: string): Cloze[] {
  const plain = src.replace(/[[\]]/g, '');
  const parts = src.split(/\[([^\]]+)\]/);  // text, particle, text, particle, ...
  const out: Cloze[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({
      id: `p:${plain}#${(i - 1) / 2}`,
      sentence: SENTENCE_BY[plain],
      before: parts.slice(0, i).join(''),
      after: parts.slice(i + 1).join(''),
      particle: parts[i],
    });
  }
  return out;
}

export function initGrammar(d: GrammarData) {
  // Sentences: the vocabulary's examples, then the grammar guide's.
  const unitOf: Record<string, string> = {};
  const sentences: [string, Sentence][] = [];
  for (const u of VOCAB_UNITS) {
    for (const w of u.words) {
      if (w.ex) { sentences.push([w.ex.ko, w.ex]); unitOf[w.ex.ko] = u.id; }
    }
  }
  for (const sn of d.sentences) { sentences.push([sn.ko, sn]); unitOf[sn.ko] = 'grammar'; }
  SENTENCE_BY = Object.fromEntries(sentences);
  GRAMMAR_SENTENCES = d.sentences;

  PARTICLES = d.particles;
  CLOZES = d.cloze.flatMap(parseCloze);
  CLOZE_BY = Object.fromEntries(CLOZES.map((c) => [c.id, c]));
  CONJ_RULES = d.conjRules;
  initForms(d.forms);

  // Word order: sentences of 3 to 8 chunks, put back in order.
  const orderable = Object.keys(SENTENCE_BY).filter((ko) => {
    const n = ko.split(' ').length;
    return n >= 3 && n <= 8;
  });

  CONJ_UNITS = [];
  GRAMMAR_UNITS = d.units.map((u) => {
    let items: string[];
    if (u.type === 'particles') items = CLOZES.filter((c) => PARTICLES[c.particle].group === u.group).map((c) => c.id);
    else if (u.type === 'order') items = orderable.filter((ko) => u.vocabUnits.includes(unitOf[ko])).map(orderId);
    else if (u.type === 'conj') {
      CONJ_UNITS.push({ id: u.id, title: u.title, items: u.items });
      items = u.items.map((c) => `c:${c.dict}`);
    } else items = FORMS.flatMap((f) => u.kinds.filter((k) => f[k]).map((k) => formId(k, f.dict)));
    return { id: u.id, title: u.title, rule: u.rule, type: u.type, items };
  });
  CONJ_BY = Object.fromEntries(CONJ_UNITS.flatMap((u) => u.items).map((c) => [`c:${c.dict}`, c]));
  // Grammar notes: one per particle group, one for word order, one per form unit.
  RULES = d.units
    .filter((u, i, all) => u.type === 'particles' || u.type === 'forms' || (u.type === 'order' && all.findIndex((x) => x.type === 'order') === i))
    .map((u) => ({ title: u.type === 'order' ? 'Word order' : u.title, text: u.rule }));
}

// ---------------------------------------------------------------------------
// Korean rules behind the explanations
// ---------------------------------------------------------------------------

export const hasBatchim = (syllable: string) => {
  const c = syllable.charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0;
};
export const endsWithL = (syllable: string) => (syllable.charCodeAt(0) - 0xac00) % 28 === 8;

// Why this form of the particle: depends on the syllable before it.
export function particleReason(particle: string, before: string) {
  const info = PARTICLES[particle];
  const last = Array.from(before.trimEnd()).pop() || '';
  const parts = [`${particle}: ${info.use}.`];
  if (info.pair) {
    parts.push(`${hasBatchim(last) ? info.pair[0] : info.pair[1]} because ${last} ends in a ${hasBatchim(last) ? 'consonant' : 'vowel'}.`);
  } else if (particle === '로' || particle === '으로') {
    parts.push(`${particle} because ${last} ends in ${hasBatchim(last) && !endsWithL(last) ? 'a consonant' : endsWithL(last) ? 'ㄹ' : 'a vowel'}.`);
  }
  return parts.join(' ');
}
