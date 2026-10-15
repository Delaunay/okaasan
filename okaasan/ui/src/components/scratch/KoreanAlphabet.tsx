// Korean trainer: the language-independent engine in ./language/engine, driven
// by the Korean pack in ./language/korean.
import { LanguageTrainer } from './language/engine/Trainer';
import { KOREAN } from './language/korean/pack';

export default function KoreanAlphabet() {
  return <LanguageTrainer pack={KOREAN} />;
}
