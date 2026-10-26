// HOI4 localisation format: parsing, language databases and output paths.

export const HOI4_LANGUAGE_NAMES: Record<string, string> = {
  en: 'english',
  fr: 'french',
  de: 'german',
  es: 'spanish',
  pt: 'braz_por',
  pl: 'polish',
  ru: 'russian',
  ja: 'japanese',
  'zh-CN': 'simp_chinese',
  ko: 'korean',
};

export const HOI4_TARGET_LANGS: Array<[string, string]> = [
  ['en', 'Английский'],
  ['fr', 'Французский'],
  ['de', 'Немецкий'],
  ['es', 'Испанский'],
  ['pt', 'Бразильский португальский'],
  ['pl', 'Польский'],
  ['ru', 'Русский'],
  ['ja', 'Японский'],
  ['zh-CN', 'Упрощённый китайский'],
  ['ko', 'Корейский'],
];

export const SOURCE_LANGUAGE_NAMES: Record<string, string> = {
  ...HOI4_LANGUAGE_NAMES,
  uk: 'ukrainian',
  it: 'italian',
  tr: 'turkish',
  cs: 'czech',
  hu: 'hungarian',
  ro: 'romanian',
};

const HOI4_LANGUAGE_NAMES_BY_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(HOI4_LANGUAGE_NAMES)) {
  HOI4_LANGUAGE_NAMES_BY_CODE[code.toLowerCase()] = name;
}

const SOURCE_LANGUAGE_NAMES_BY_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(SOURCE_LANGUAGE_NAMES)) {
  SOURCE_LANGUAGE_NAMES_BY_CODE[code.toLowerCase()] = name;
}

export const HOI4_LANGUAGE_DIRECTORIES = new Set(
  Object.values(HOI4_LANGUAGE_NAMES).map((s) => s.toLowerCase())
);

export function get_hoi4_language_name(targetLang: string): string {
  const name = HOI4_LANGUAGE_NAMES_BY_CODE[targetLang.toLowerCase()];
  if (name) return name;
  const supported = Object.keys(HOI4_LANGUAGE_NAMES).join(', ');
  throw new Error(
    `Неподдерживаемый целевой язык HOI4: '${targetLang}'. Доступны: ${supported}.`
  );
}

export function normalize_key(prefix: string): string {
  return prefix.trim().replace(/:\d*$/, '');
}

/**
 * SHA-256 fingerprint for caching and detecting mod edits.
 */
export async function source_text_hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const VALUE_PREFIX_RE = /^(\s*[A-Za-z0-9_.-]+:\d*\s*)/;
export const VALUE_SUFFIX_RE = /^[ \t]*(?:#.*)?$/;
export const LANGUAGE_HEADER_RE = /^[ \t]*l_([A-Za-z0-9_]+):[ \t]*(?:#.*)?$/i;

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === '\\') {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

/**
 * Split `KEY:0 "value" # comment` into `[prefix, value, suffix]`.
 * Scans from right to left to support real mods containing unescaped inner quotes.
 */
export function split_value_line(content: string): [string, string, string] | null {
  const match = VALUE_PREFIX_RE.exec(content);
  if (!match) return null;

  const start = match[0].length;
  if (content[start] !== '"') return null;

  for (let pos = content.length - 1; pos > start; pos--) {
    if (content[pos] !== '"' || isEscaped(content, pos)) {
      continue;
    }
    const suffix = content.slice(pos + 1);
    if (VALUE_SUFFIX_RE.test(suffix)) {
      return [match[1], content.slice(start + 1, pos), suffix];
    }
  }
  return null;
}

export function split_line_ending(line: string): [string, string] {
  if (line.endsWith('\r\n')) {
    return [line.slice(0, -2), '\r\n'];
  }
  if (line.endsWith('\n') || line.endsWith('\r')) {
    return [line.slice(0, -1), line.slice(-1)];
  }
  return [line, ''];
}

/**
 * Ensures target language header `l_<target_name>:` on first line,
 * and strips duplicate language blocks if source file had multiple language sections.
 */
export function prepare_target_localisation_lines(
  lines: string[],
  targetName: string,
  sourceLang: string,
  logCb?: (msg: string, tag?: 'info' | 'warning' | 'error' | 'success') => void
): { lines: string[]; headerIndexes: Set<number>; structureChanged: boolean } | null {
  const headerRows: Array<[number, string]> = [];
  for (let i = 0; i < lines.length; i++) {
    const [content] = split_line_ending(lines[i]);
    const match = LANGUAGE_HEADER_RE.exec(content);
    if (match) {
      headerRows.push([i, match[1].toLowerCase()]);
    }
  }

  const distinctLanguages = Array.from(new Set(headerRows.map(([, lang]) => lang)));
  const selectedSourceName = SOURCE_LANGUAGE_NAMES_BY_CODE[sourceLang.toLowerCase()];

  if (distinctLanguages.length === 1 && selectedSourceName) {
    const actualSourceName = distinctLanguages[0];
    if (selectedSourceName !== actualSourceName) {
      logCb?.(
        `  Файл пропущен: заголовок l_${actualSourceName} не совпадает с выбранным исходным языком '${sourceLang}'; перевод небезопасен`,
        'error'
      );
      return null;
    }
  }

  let activeLines = lines;
  if (distinctLanguages.length > 1) {
    if (!selectedSourceName || !distinctLanguages.includes(selectedSourceName)) {
      const found = distinctLanguages.map((n) => `l_${n}`).join(', ');
      logCb?.(
        `  Файл содержит несколько языковых баз (${found}), но выбранный исходный язык '${sourceLang}' не совпадает ни с одной; файл пропущен`,
        'error'
      );
      return null;
    }

    const firstHeader = headerRows[0][0];
    const selectedBlocks: string[] = [];
    for (let i = 0; i < headerRows.length; i++) {
      const [start, language] = headerRows[i];
      const stop = i + 1 < headerRows.length ? headerRows[i + 1][0] : lines.length;
      if (language === selectedSourceName) {
        selectedBlocks.push(...lines.slice(start, stop));
      }
    }
    activeLines = [...lines.slice(0, firstHeader), ...selectedBlocks];
    logCb?.(
      `  В файле несколько языковых баз; оставлена l_${selectedSourceName} (исходный язык ${sourceLang})`,
      'info'
    );
  }

  const output: string[] = [];
  const headerIndexes = new Set<number>();
  let structureChanged = false;

  for (let i = 0; i < activeLines.length; i++) {
    const line = activeLines[i];
    const [content, ending] = split_line_ending(line);
    if (LANGUAGE_HEADER_RE.test(content)) {
      output.push(`l_${targetName}:${ending || '\n'}`);
      headerIndexes.add(i);
      if (content !== `l_${targetName}:`) {
        structureChanged = true;
      }
    } else {
      output.push(line);
    }
  }

  if (!headerIndexes.has(0)) {
    const defaultEnding = output.length > 0 && output[0].includes('\r\n') ? '\r\n' : '\n';
    output.unshift(`l_${targetName}:${defaultEnding}`);
    const newHeaderIndexes = new Set<number>([0]);
    for (const idx of headerIndexes) {
      newHeaderIndexes.add(idx + 1);
    }
    structureChanged = true;
    return { lines: output, headerIndexes: newHeaderIndexes, structureChanged };
  }

  return { lines: output, headerIndexes, structureChanged };
}

/**
 * Renames relative path to standard HoI4 output structure and target language suffix:
 * e.g. "localisation/english/demo_l_english.yml" -> "localisation/russian/demo_l_russian.yml"
 */
export function rename_dst(srcRelPath: string, targetLang = 'ru'): string {
  const targetName = get_hoi4_language_name(targetLang);
  const normalized = srcRelPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const filename = parts.pop() || '';

  if (!filename.toLowerCase().endsWith('.yml')) {
    throw new Error('Локализационные файлы HOI4 должны иметь расширение .yml');
  }

  const stem = filename
    .slice(0, -4)
    .replace(/_l_[a-z0-9_-]+$/i, '');
  const newFilename = `${stem}_l_${targetName}.yml`;

  // Replace recognized language folder names
  const updatedParts = parts.map((part) =>
    HOI4_LANGUAGE_DIRECTORIES.has(part.toLowerCase()) ? targetName : part
  );

  return updatedParts.length > 0
    ? `${updatedParts.join('/')}/${newFilename}`
    : newFilename;
}

/**
 * Generates valid HOI4 output lines and attaches UTF-8 BOM.
 */
export function build_output_lines(
  outLines: string[],
  indexes: number[],
  values: string[],
  meta: Array<[string, string, string]>
): string {
  const lines = [...outLines];
  for (let i = 0; i < indexes.length; i++) {
    const lineIndex = indexes[i];
    const translated = values[i];
    const [prefix, suffix, lineEnding] = meta[i];
    lines[lineIndex] = `${prefix}"${translated}"${suffix}${lineEnding}`;
  }
  // Prepend UTF-8 BOM mark (\uFEFF)
  const fullText = lines.join('');
  return fullText.startsWith('\uFEFF') ? fullText : `\uFEFF${fullText}`;
}
