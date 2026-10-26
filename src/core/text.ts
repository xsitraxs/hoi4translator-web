// Text helpers: placeholder protection, typography and request chunking.

export const PLACEHOLDER_RE =
  /(\$\$|\$[^$]+\$|\[[^\]]*\]|§\[[^\]]*\]|§§|§[A-Za-z0-9!]|\\+.|\\{2,}|£\w+(?:\|\d+)?|@\w+\[!?\]?)/g;

export const MAX_QUERY_CHARS = 400;

export interface GlossaryMatcher {
  pattern: RegExp | null;
  lookup: (term: string) => string;
}

export class PostProcessor {
  private static DOUBLE_SPACE_RE = / {2,}/g;
  private static SPACE_BEFORE_PUNCT_RE = / +([,;:!?])/g;
  private static FRENCH_SPACE_BEFORE_COMMA_RE = / +,/g;
  private static FRENCH_SPACE_BEFORE_PUNCT_RE = / +([;:!?])/g;
  private static QUOTED_PHRASE_RE = /"([^"\\]+)"/g;
  private static SPACE_AROUND_NEWLINE_RE = /[ \t]*\\n[ \t]*/g;
  private static LEFTOVER_PH_RE = /<<PH\d+>>/g;

  private static QUOTE_STYLES: Record<string, [string, string, string]> = {
    en: ['“', '”', ''],
    fr: ['«', '»', '\u202f'],
    de: ['„', '“', ''],
    es: ['«', '»', ''],
    pt: ['“', '”', ''],
    pl: ['„', '”', ''],
    ru: ['«', '»', ''],
    ja: ['「', '」', ''],
    'zh-cn': ['「', '」', ''],
    ko: ['“', '”', ''],
  };

  public static process(text: string, targetLang = 'ru'): string {
    if (!text) return text;

    // HOI4 newline escapes are literal two-character sequences in a value:
    let result = text.replace(this.SPACE_AROUND_NEWLINE_RE, '\\n');

    const tokens: string[] = [];
    let markerPrefix = '\uE000HOI4PP_';
    while (result.includes(markerPrefix)) {
      markerPrefix += '_';
    }

    // Protect placeholders during typography fixes
    result = result.replace(PLACEHOLDER_RE, (match) => {
      const idx = tokens.length;
      tokens.push(match);
      return `${markerPrefix}${idx}\uE001`;
    });

    const language = targetLang.replace('_', '-').toLowerCase();
    const [quoteOpen, quoteClose, quoteSpace] =
      this.QUOTE_STYLES[language] || ['“', '”', ''];

    result = result.replace(
      this.QUOTED_PHRASE_RE,
      (_, phrase) => `${quoteOpen}${quoteSpace}${phrase}${quoteSpace}${quoteClose}`
    );

    result = result.replace(this.DOUBLE_SPACE_RE, ' ');

    if (language === 'fr') {
      result = result.replace(this.FRENCH_SPACE_BEFORE_COMMA_RE, ',');
      result = result.replace(
        this.FRENCH_SPACE_BEFORE_PUNCT_RE,
        (_, p) => `\u202f${p}`
      );
    } else {
      result = result.replace(this.SPACE_BEFORE_PUNCT_RE, '$1');
    }

    result = result.trim();

    // Restore tokens
    const markerRe = new RegExp(`${markerPrefix}(\\d+)\uE001`, 'g');
    result = result.replace(markerRe, (_, idxStr) => {
      const idx = parseInt(idxStr, 10);
      return idx < tokens.length ? tokens[idx] : _;
    });

    return result.replace(this.LEFTOVER_PH_RE, '');
  }
}

/**
 * Mask game markers (and glossary terms) before sending text to an engine.
 */
export function protect_placeholders(
  text: string,
  glossary?: GlossaryMatcher | null
): [string, string[]] {
  const tokens: string[] = [];

  // 1. Protect game markers
  let protectedText = text.replace(PLACEHOLDER_RE, (match) => {
    tokens.push(match);
    return `<<PH${tokens.length - 1}>>`;
  });

  // 1a. Glossary terms: token is restored already translated
  if (glossary && glossary.pattern) {
    protectedText = protectedText.replace(glossary.pattern, (match) => {
      tokens.push(glossary.lookup(match));
      return `<<PH${tokens.length - 1}>>`;
    });
  }

  // 2. Insert zero-width space between adjacent markers so translation engine won't merge them
  protectedText = protectedText.replace(
    /(<<PH\d+>>)(<<PH\d+>>)/g,
    '$1\u200B$2'
  );

  return [protectedText, tokens];
}

/**
 * Restore game placeholders and glossary translations into the translated text.
 */
export function restore_placeholders(text: string, tokens: string[]): string {
  // Remove zero-width spaces
  let cleaned = text.replace(/\u200B/g, '');

  // Match any case and spacing: <<PH0>>, << PH 0 >>, <<ph0>> etc.
  cleaned = cleaned.replace(/<<\s*ph\s*(\d+)\s*>>/gi, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return idx >= 0 && idx < tokens.length ? tokens[idx] : match;
  });

  return cleaned;
}

const SENTENCE_TERMINATORS = new Set(['.', '!', '?', '。', '！', '？']);

function findChunkBoundary(text: string, start: int, hardEnd: int): int {
  const markerRe = /<<PH\d+>>/g;
  let safeEnd = hardEnd;
  let match: RegExpExecArray | null;

  while ((match = markerRe.exec(text)) !== null) {
    if (match.index >= hardEnd) break;
    if (match.index + match[0].length > hardEnd) {
      safeEnd = match.index > start ? match.index : match.index + match[0].length;
      break;
    }
  }

  let sentenceBoundary = -1;
  let wordBoundary = -1;

  for (let i = safeEnd - 1; i > start; i--) {
    if (!/\s/.test(text[i])) continue;
    if (wordBoundary < 0) {
      wordBoundary = i + 1;
    }
    let prev = i - 1;
    while (prev >= start && /\s/.test(text[prev])) {
      prev--;
    }
    if (prev >= start && SENTENCE_TERMINATORS.has(text[prev])) {
      sentenceBoundary = i + 1;
      break;
    }
  }

  let end =
    sentenceBoundary > start
      ? sentenceBoundary
      : wordBoundary > start
      ? wordBoundary
      : safeEnd;

  // Verify chosen boundary does not slice inside any marker
  markerRe.lastIndex = 0;
  while ((match = markerRe.exec(text)) !== null) {
    if (match.index >= end) break;
    if (match.index + match[0].length > end) {
      end = match.index > start ? match.index : match.index + match[0].length;
      break;
    }
  }

  if (end <= start) {
    end = safeEnd > start ? safeEnd : hardEnd;
  }
  return end;
}

type int = number;

/**
 * Split long text into translatable chunks, never cutting placeholders or words.
 */
export function split_long_text(text: string, limit = MAX_QUERY_CHARS): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let start = 0;
  const length = text.length;

  while (start < length) {
    const hardEnd = Math.min(start + limit, length);
    if (hardEnd === length) {
      chunks.push(text.slice(start));
      break;
    }
    const end = findChunkBoundary(text, start, hardEnd);
    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}
