interface BuildToolboxOptions {
  prefixMap?: Record<string, string>;
  order?: string[];
  typeToCategory?: Record<string, string>;
}

interface ToolboxCategory {
  kind: 'category';
  name: string;
  contents?: Array<{ kind: 'block'; type: string }>;
  custom?: string;
}

interface Toolbox {
  kind: 'categoryToolbox';
  contents: ToolboxCategory[];
}

interface BuildToolboxOptions {
  prefixMap?: Record<string, string>;
  order?: string[];
  typeToCategory?: Record<string, string>;
}

interface ToolboxCategory {
  kind: 'category';
  name: string;
  contents?: Array<{ kind: 'block'; type: string }>;
  custom?: string;
}

interface Toolbox {
  kind: 'categoryToolbox';
  contents: ToolboxCategory[];
}

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function extractBlocksFromValue(typeKey: string, val: any): Record<string, any> | null {
  // If the value *is* a block definition object (init/json/jsonInit) return as single-entry map
  if (isPlainObject(val) && (typeof val.init === 'function' || typeof val.json === 'object' || typeof val.jsonInit === 'object')) {
    return { [typeKey]: val };
  }
  // If the value is a module-like object with `.blocks` mapping, return that mapping
  if (isPlainObject(val) && isPlainObject(val.blocks)) {
    return val.blocks;
  }
  // If the value itself is a mapping of block definitions keyed by type, detect heuristically
  const keys = isPlainObject(val) ? Object.keys(val) : [];
  if (keys.length > 0 && keys.every(k => isPlainObject(val[k]) && (typeof val[k].init === 'function' || typeof val[k].json === 'object' || typeof val[k].jsonInit === 'object'))) {
    return val as Record<string, any>;
  }
  return null;
}

export function buildToolboxFromBlocks(
  blocks: Record<string, any>,
  opts: BuildToolboxOptions = {}
): Toolbox {
  const defaultPrefixMap: Record<string, string> = {
    'controls_': 'Logic',
    'logic_': 'Logic',
    'math_': 'Math',
    'text_': 'Text',
    'lists_': 'Lists',
    'colour_': 'Colour',
    'colour': 'Colour',
    'variables_': 'Variables',
    'procedures_': 'Functions',
    'procedures': 'Functions',
    'controls': 'Logic',
    'repeat': 'Loops',
    'controls_repeat_': 'Loops',
    'time_': 'Other',
    'io_': 'Other'
  };

  const prefixMap = Object.assign({}, defaultPrefixMap, opts.prefixMap || {});

  function getCategoryFromDef(def: any): string | null {
    if (!def) return null;
    const candidates = [def.json, def.jsonInit, def.definition];
    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === 'object' && c.category) return String(c.category);
    }
    return null;
  }

  function getCategoryFromPrefix(type: string): string {
    const prefixes = Object.keys(prefixMap).sort((a, b) => b.length - a.length);
    for (const p of prefixes) {
      if (type.startsWith(p)) return prefixMap[p];
    }
    const token = type.split('_')[0];
    if (token && token.length > 0) return token.charAt(0).toUpperCase() + token.slice(1);
    return 'Other';
  }

  // 1) Normalize input: expand nested .blocks or module-like values
  const normalized: Record<string, any> = {};
  const skipped: Array<{ key: string; reason: string; value: any }> = [];

  for (const key of Object.keys(blocks || {})) {
    const val = blocks[key];
    // Try simple extraction heuristics
    const extracted = extractBlocksFromValue(key, val);
    if (extracted) {
      // merge extracted into normalized (careful with collisions)
      for (const [t, def] of Object.entries(extracted)) {
        if (normalized[t]) {
          // collision: log and skip overriding
          skipped.push({ key: t, reason: `collision while extracting from ${String(key)}`, value: def });
        } else {
          normalized[t] = def;
        }
      }
    } else {
      // Could be a primitive module marker or something invalid — skip and report
      skipped.push({ key, reason: 'not a block definition or .blocks container', value: val });
    }
  }

  if (skipped.length > 0) {
    // Useful debug output — you can remove or route to logger
    // eslint-disable-next-line no-console
    console.warn('buildToolboxFromBlocks: skipped entries:', skipped.slice(0, 20));
  }

  // 2) Group types into categories
  const categories = new Map<string, Set<string>>();
  function addTypeToCategory(category: string, type: string) {
    if (!categories.has(category)) categories.set(category, new Set());
    categories.get(category)!.add(type);
  }

  for (const type of Object.keys(normalized)) {
    // allow explicit mapping
    if (opts.typeToCategory?.[type]) {
      addTypeToCategory(opts.typeToCategory[type]!, type);
      continue;
    }

    const def = normalized[type];
    const catFromDef = getCategoryFromDef(def);
    if (catFromDef) {
      addTypeToCategory(catFromDef, type);
      continue;
    }

    // families
    if (type === 'variables_get' || type === 'variables_set' || type.startsWith('variables')) {
      addTypeToCategory('Variables', type);
      continue;
    }
    if (type.startsWith('procedures') || type.startsWith('procedure')) {
      addTypeToCategory('Functions', type);
      continue;
    }

    addTypeToCategory(getCategoryFromPrefix(type), type);
  }

  // Ensure UX categories exist
  if (!categories.has('Variables')) categories.set('Variables', new Set());
  if (!categories.has('Functions')) categories.set('Functions', new Set());

  const defaultOrder = opts.order || [
    'Logic', 'Loops', 'Math', 'Text', 'Lists', 'Colour', 'Variables', 'Functions', 'Other'
  ];

  function typesToBlockEntries(typesSet: Set<string>): Array<{ kind: 'block'; type: string }> {
    return Array.from(typesSet).sort((a, b) => a.localeCompare(b)).map(t => ({ kind: 'block', type: t }));
  }

  const contents: ToolboxCategory[] = [];
  const added = new Set<string>();
  for (const cat of defaultOrder) {
    if (!categories.has(cat)) continue;
    const types = categories.get(cat);
    if (!types) continue;
    if (cat === 'Variables') {
      contents.push({ kind: 'category', name: 'Variables', custom: 'VARIABLE' });
    } else if (cat === 'Functions') {
      contents.push({ kind: 'category', name: 'Functions', custom: 'PROCEDURE' });
    } else {
      contents.push({ kind: 'category', name: cat, contents: typesToBlockEntries(types) });
    }
    added.add(cat);
  }

  const remaining = Array.from(categories.keys()).filter(c => !added.has(c)).sort();
  for (const cat of remaining) {
    const types = categories.get(cat);
    if (!types) continue;
    contents.push({ kind: 'category', name: cat, contents: typesToBlockEntries(types) });
  }

  return { kind: 'categoryToolbox', contents };
}
