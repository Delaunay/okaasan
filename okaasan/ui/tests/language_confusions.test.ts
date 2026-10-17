import { expect, test } from 'vitest';
import { updateConfusions } from '../src/components/scratch/language/engine/util';
test('confusion pairs fade when both sides are answered right', () => {
  const c = { 'pt:는|pt:은': 4, 'v:a|v:b': 3, 'v:c|x:bad': 5 };
  const r = updateConfusions(c, [
    { key: 'p:1', ok: true, option: 'pt:은' }, { key: 'p:2', ok: true, option: 'pt:는' },
    { key: 'v:a', ok: true }, { key: 'v:b', ok: false },
    { key: 'v:c', ok: true },
  ], [['v:b', 'v:d']]);
  expect(r).toEqual({ 'v:a|v:b': 3, 'v:c|x:bad': 2, 'v:b|v:d': 1 });
});
