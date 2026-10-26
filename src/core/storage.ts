// Persistent TranslationCache and file source fingerprints

export interface CacheStats {
  total: number;
  engines: number;
  files: number;
}

export class TranslationCache {
  private static CACHE_KEY_PREFIX = 'hoi4_cache_trans_';
  private static HASH_KEY_PREFIX = 'hoi4_cache_hashes_';

  private cacheKey(
    text: string,
    sourceLang: string,
    targetLang: string,
    engine: string
  ): string {
    return `${TranslationCache.CACHE_KEY_PREFIX}${engine.toLowerCase()}_${sourceLang.toLowerCase()}_${targetLang.toLowerCase()}_${encodeURIComponent(text)}`;
  }

  public get(
    text: string,
    sourceLang: string,
    targetLang: string,
    engine: string
  ): string | null {
    try {
      const key = this.cacheKey(text, sourceLang, targetLang, engine);
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  public set(
    text: string,
    translation: string,
    sourceLang: string,
    targetLang: string,
    engine: string
  ): void {
    try {
      const key = this.cacheKey(text, sourceLang, targetLang, engine);
      localStorage.setItem(key, translation);
    } catch {
      // Ignore quota errors if storage full
    }
  }

  public getSourceHashes(dstPath: string): Record<string, string> {
    try {
      const stored = localStorage.getItem(`${TranslationCache.HASH_KEY_PREFIX}${dstPath}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  public setSourceHashes(dstPath: string, hashes: Record<string, string>): void {
    try {
      localStorage.setItem(
        `${TranslationCache.HASH_KEY_PREFIX}${dstPath}`,
        JSON.stringify(hashes)
      );
    } catch {
      // Ignore quota errors
    }
  }

  public getStats(): CacheStats {
    let total = 0;
    const engines = new Set<string>();
    let files = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(TranslationCache.CACHE_KEY_PREFIX)) {
          total++;
          const parts = key.slice(TranslationCache.CACHE_KEY_PREFIX.length).split('_');
          if (parts[0]) engines.add(parts[0]);
        } else if (key.startsWith(TranslationCache.HASH_KEY_PREFIX)) {
          files++;
        }
      }
    } catch {
      // Ignore
    }

    return { total, engines: engines.size, files };
  }

  public clear(engine?: string, sourceLang?: string, targetLang?: string): number {
    let removed = 0;
    try {
      const keysToRemove: string[] = [];
      const prefix = TranslationCache.CACHE_KEY_PREFIX;
      const filterPrefix = engine
        ? `${prefix}${engine.toLowerCase()}_${sourceLang ? sourceLang.toLowerCase() + '_' : ''}${targetLang ? targetLang.toLowerCase() + '_' : ''}`
        : prefix;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(filterPrefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
        removed++;
      }
    } catch {
      // Ignore
    }
    return removed;
  }
}

export const translationCache = new TranslationCache();

export interface SavedSettings {
  engine: 'Gemini' | 'Google' | 'DeepL' | 'MyMemory' | 'JavaSim';
  sourceLang: string;
  targetLang: string;
  apiKey: string;
  concurrency: number;
  skipTranslated: boolean;
  autoDownloadZip: boolean;
  previewEnabled: boolean;
  reuseFallbackCache: boolean;
  brokenLinesMode: 'reject_file' | 'keep_original';
}

export const DEFAULT_SETTINGS: SavedSettings = {
  engine: 'Gemini',
  sourceLang: 'en',
  targetLang: 'ru',
  apiKey: '',
  concurrency: 8,
  skipTranslated: true,
  autoDownloadZip: false,
  previewEnabled: false,
  reuseFallbackCache: false,
  brokenLinesMode: 'reject_file',
};

const SETTINGS_STORAGE_KEY = 'hoi4_translator_settings';

export function loadSavedSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<SavedSettings>): void {
  try {
    const current = loadSavedSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
}
