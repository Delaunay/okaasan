// Korean trainer: the language-independent engine in ./language/engine, with
// the Korean module in ./language/korean and the data, audio and pack.json in
// website/uploads/language/korean/.
import { LanguageTrainer } from './language/engine/Trainer';
import { KOREAN } from './language/korean/module';

export default function KoreanAlphabet() {
  return <LanguageTrainer dir="uploads/language/korean/" module={KOREAN} />;
}
