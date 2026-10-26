// Vanilla localization index and reuse cache

import { split_value_line, split_line_ending, normalize_key } from './localisation';

export class VanillaIndex {
  // Map source text -> official target translation
  private textMap: Map<string, string> = new Map();
  // Map normalized key -> official target translation
  private keyMap: Map<string, string> = new Map();

  public get size(): number {
    return this.textMap.size;
  }

  public clear(): void {
    this.textMap.clear();
    this.keyMap.clear();
  }

  /**
   * Add a pair of source and target vanilla localization files.
   */
  public addFilePair(sourceContent: string, targetContent: string): number {
    const srcLines = sourceContent.split(/\r?\n/);
    const tgtLines = targetContent.split(/\r?\n/);

    const srcEntries: Map<string, string> = new Map();
    for (const line of srcLines) {
      const [content] = split_line_ending(line);
      const parts = split_value_line(content);
      if (parts) {
        const [prefix, value] = parts;
        srcEntries.set(normalize_key(prefix), value);
      }
    }

    let loaded = 0;
    for (const line of tgtLines) {
      const [content] = split_line_ending(line);
      const parts = split_value_line(content);
      if (parts) {
        const [prefix, targetVal] = parts;
        const normKey = normalize_key(prefix);
        const sourceVal = srcEntries.get(normKey);
        if (sourceVal && targetVal) {
          this.textMap.set(sourceVal, targetVal);
          this.keyMap.set(normKey, targetVal);
          loaded++;
        }
      }
    }

    return loaded;
  }

  /**
   * Quick lookup by original English/source text value.
   */
  public lookup(sourceText: string): string | null {
    return this.textMap.get(sourceText) || null;
  }

  /**
   * Lookup by localization key.
   */
  public lookupByKey(key: string): string | null {
    return this.keyMap.get(normalize_key(key)) || null;
  }
}
