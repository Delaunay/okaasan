// Loads a language pack folder: pack.json, its data files and keyboard, and
// combines them with the language module into a LanguagePack.
import { resolveMediaUrl } from '../../../../services/api';
import type { LanguageModule, LanguagePack, LevelDef, PackManifest } from './types';
import { describeGeneric, dialogueLevel, drillGeneric, itemsLevel } from './generic';
import { shuffle } from './util';

const defaultNormalize = (s: string) => s.replace(/[\s?!.,~'"]/g, '').toLowerCase();

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// `dir` is relative to the site's uploads, e.g. 'uploads/language/korean/'.
export async function loadPack(dir: string, module: LanguageModule): Promise<LanguagePack> {
  const base = resolveMediaUrl(dir)!;
  const manifest = await getJson<PackManifest>(`${base}pack.json`);
  const keys = Object.keys(manifest.data);
  const [keyboard, ...files] = await Promise.all([
    getJson<{ rows: string[]; map: Record<string, string>; hint?: string }>(`${base}${manifest.keyboard}`),
    ...keys.map((k) => getJson<unknown>(`${base}${manifest.data[k]}`)),
  ]);
  const data = Object.fromEntries(keys.map((k, i) => [k, files[i]]));
  module.init(data);

  const levels: LevelDef[] = manifest.levels.map((l) => {
    if (l.type === 'items') return itemsLevel(l.id, l.title, data[l.data!] as never);
    if (l.type === 'dialogue') return dialogueLevel(l.id, l.title, data[l.data!] as never);
    const make = l.module && module.levels[l.module];
    if (!make) throw new Error(`pack.json: no module level "${l.module}"`);
    return make(l.id, l.title);
  });

  return {
    id: manifest.id,
    name: manifest.name,
    nativeName: manifest.nativeName,
    font: manifest.font,
    storage: manifest.storage,
    audio: { base: `${dir}${manifest.audio.dir}`, lang: manifest.lang, preview: manifest.audio.preview },
    keyboard: { ...keyboard, compose: module.compose ?? ((k) => k.join('')) },
    normalize: module.normalize ?? defaultNormalize,
    levels,
    gloss: data.gloss as LanguagePack['gloss'],
    describe: (k) => module.describe?.(k) ?? describeGeneric(k),
    drill: (keys, ctx) => shuffle([...(module.drill?.(keys, ctx) ?? []), ...drillGeneric(keys, ctx)]).slice(0, 24),
  };
}
