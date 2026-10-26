// Validation of translated values and the per-run validation report.

import { PLACEHOLDER_RE } from './text';

export class PlaceholderValidator {
  public static extractPlaceholders(text: string): string[] {
    const matches = text.match(PLACEHOLDER_RE);
    return matches ? Array.from(matches) : [];
  }

  private static COLOR_MARKER_RE = /§(?:\[[^\]]*\]|[A-Za-z0-9!])/g;
  private static COLOR_CODE_CHAR_RE = /^[A-Za-z0-9!]$/;

  private static invalidSections(text: string): number[] {
    const positions: number[] = [];
    let index = 0;
    const length = text.length;

    while (index < length) {
      if (text[index] !== '§') {
        index++;
        continue;
      }
      const following = text[index + 1] || '';
      if (following === '[') {
        const closing = text.indexOf(']', index + 2);
        if (closing !== -1) {
          index = closing + 1;
          continue;
        }
      }
      if (
        following === '§' ||
        (following && this.COLOR_CODE_CHAR_RE.test(following))
      ) {
        index += 2;
        continue;
      }
      positions.push(index);
      index++;
    }
    return positions;
  }

  private static colorFormatIssues(text: string, label: string): string[] {
    const issues: string[] = [];
    if (this.invalidSections(text).length > 0) {
      issues.push(`${label}: некорректный знак §`);
    }

    let activeColor = false;
    const markers = text.match(this.COLOR_MARKER_RE) || [];
    for (const marker of markers) {
      activeColor = marker !== '§!';
    }
    if (activeColor) {
      issues.push(`${label}: цветовой маркер не закрыт через §!`);
    }
    return issues;
  }

  public static validate(original: string, translated: string): string[] {
    const issues: string[] = [];
    issues.push(...this.colorFormatIssues(original, 'исходник'));
    issues.push(...this.colorFormatIssues(translated, 'перевод'));

    const originalColors = original.match(this.COLOR_MARKER_RE) || [];
    const translatedColors = translated.match(this.COLOR_MARKER_RE) || [];

    if (
      originalColors.join('') !== translatedColors.join('') &&
      [...originalColors].sort().join('') === [...translatedColors].sort().join('')
    ) {
      issues.push('изменён порядок цветовых маркеров §');
    }

    const origPhs = this.extractPlaceholders(original);
    const transPhs = this.extractPlaceholders(translated);

    const origCounts: Record<string, number> = {};
    for (const ph of origPhs) {
      origCounts[ph] = (origCounts[ph] || 0) + 1;
    }

    const transCounts: Record<string, number> = {};
    for (const ph of transPhs) {
      transCounts[ph] = (transCounts[ph] || 0) + 1;
    }

    for (const [ph, count] of Object.entries(origCounts)) {
      const transCount = transCounts[ph] || 0;
      if (transCount === 0) {
        issues.push(`потерян: '${ph}'`);
      } else if (transCount < count) {
        issues.push(`недостаёт ${count - transCount}x '${ph}'`);
      } else if (transCount > count) {
        issues.push(`дублирован ${transCount - count}x '${ph}'`);
      }
    }

    for (const ph of Object.keys(transCounts)) {
      if (!(ph in origCounts)) {
        issues.push(`лишний: '${ph}'`);
      }
    }

    return issues;
  }
}

export function hasUnescapedQuote(text: string): boolean {
  let backslashes = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      backslashes++;
      continue;
    }
    if (ch === '"' && backslashes % 2 === 0) {
      return true;
    }
    backslashes = 0;
  }
  return false;
}

export function validate_line(original: string, translated: string): string[] {
  const issues: string[] = [];
  if (translated.includes('\n') || translated.includes('\r')) {
    issues.push('значение должно занимать одну физическую строку; используйте \\n');
  }
  if (hasUnescapedQuote(translated)) {
    issues.push('внутренние кавычки нужно экранировать как \\"');
  }
  issues.push(...PlaceholderValidator.validate(original, translated));
  return issues;
}

export function validate_pairs(originals: string[], translations: string[]): string[][] {
  if (originals.length !== translations.length) {
    throw new Error(
      `Количество строк изменилось: ожидалось ${originals.length}, получено ${translations.length}`
    );
  }
  return originals.map((orig, i) => validate_line(orig, translations[i]));
}

export function source_issues(original: string): string[] {
  return PlaceholderValidator.validate(original, original);
}

/**
 * Split a row's issues into those inherited from the source and those newly introduced.
 */
export function split_row_issues(
  original: string,
  issues: string[]
): { inherited: string[]; introduced: string[] } {
  const known = new Set(source_issues(original));
  const inherited: string[] = [];
  const introduced: string[] = [];

  for (const issue of issues) {
    const normalised = issue.replace('перевод:', 'исходник:');
    if (known.has(normalised)) {
      inherited.push(issue);
    } else {
      introduced.push(issue);
    }
  }

  return { inherited, introduced };
}

export function validate_preview_translations(
  originals: string[],
  translations: string[]
): string[] {
  try {
    const rows = validate_pairs(originals, translations);
    const problems: string[] = [];
    rows.forEach((issues, index) => {
      if (issues.length > 0) {
        problems.push(`Строка ${index + 1}: ${issues.join(', ')}`);
      }
    });
    return problems;
  } catch (err: unknown) {
    return [String(err)];
  }
}

export class ValidationReport {
  public static MAX_TRACKED_BROKEN = 500;
  public total = 0;
  public valid = 0;
  public fixed = 0;
  public broken: Array<{ file: string; key: string; issues: string[] }> = [];
  public untrackedBroken = 0;

  public record(file: string, key: string, issues: string[], autoFixed: boolean): void {
    this.total++;
    if (issues.length === 0) {
      this.valid++;
    } else if (autoFixed) {
      this.fixed++;
    } else if (this.broken.length < ValidationReport.MAX_TRACKED_BROKEN) {
      this.broken.push({ file, key, issues });
    } else {
      this.untrackedBroken++;
    }
  }

  public get brokenCount(): number {
    return this.broken.length + this.untrackedBroken;
  }

  public brokenForFile(file: string): Array<{ file: string; key: string; issues: string[] }> {
    return this.broken.filter((entry) => entry.file === file);
  }

  public summary(): string {
    return `Валидация: ${this.valid}/${this.total} OK | авто-фикс: ${this.fixed} | битых: ${this.brokenCount}`;
  }
}
