// Glossary parser and term-replacement matcher

export interface GlossaryEntry {
  term: string;
  translation: string;
}

export class Glossary {
  private terms: Map<string, string> = new Map();
  public pattern: RegExp | null = null;

  constructor(content?: string) {
    if (content) {
      this.load(content);
    }
  }

  public get size(): number {
    return this.terms.size;
  }

  public load(content: string): void {
    this.terms.clear();
    const trimmed = content.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object') {
              const term = item.term || item.source || item.key;
              const trans = item.translation || item.target || item.val;
              if (term && trans) {
                this.terms.set(String(term).toLowerCase(), String(trans));
              }
            }
          }
        } else if (typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (k && v) {
              this.terms.set(k.toLowerCase(), String(v));
            }
          }
        }
      } catch {
        // Fall back to line by line
      }
    }

    if (this.terms.size === 0) {
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        const lineTrimmed = line.trim();
        if (!lineTrimmed || lineTrimmed.startsWith('#')) continue;

        let parts: string[] = [];
        if (lineTrimmed.includes('\t')) {
          parts = lineTrimmed.split('\t');
        } else if (lineTrimmed.includes(',')) {
          parts = lineTrimmed.split(',');
        } else if (lineTrimmed.includes('=')) {
          parts = lineTrimmed.split('=');
        } else if (lineTrimmed.includes(';')) {
          parts = lineTrimmed.split(';');
        }

        if (parts.length >= 2) {
          const term = parts[0].trim();
          const translation = parts[1].trim();
          if (term && translation) {
            this.terms.set(term.toLowerCase(), translation);
          }
        }
      }
    }

    this.rebuildPattern();
  }

  private rebuildPattern(): void {
    if (this.terms.size === 0) {
      this.pattern = null;
      return;
    }

    // Sort by term length descending so longer expressions take precedence
    const keys = Array.from(this.terms.keys()).sort((a, b) => b.length - a.length);
    const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Match whole words using \b (boundary)
    this.pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  public lookup(term: string): string {
    return this.terms.get(term.toLowerCase()) || term;
  }

  public getAllEntries(): GlossaryEntry[] {
    const list: GlossaryEntry[] = [];
    for (const [term, translation] of this.terms.entries()) {
      list.push({ term, translation });
    }
    return list;
  }
}
