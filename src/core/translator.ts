// Translation engines, fallback chain, retry backoff, and concurrency control

import {
  PostProcessor,
  protect_placeholders,
  restore_placeholders,
  split_long_text,
} from './text';
import { validate_line, validate_preview_translations, ValidationReport } from './validation';
import { Glossary } from './glossary';
import { translationCache } from './storage';
import { TranslationEngine } from '../types';

export const FALLBACK_CHAIN: Record<TranslationEngine, TranslationEngine[]> = {
  Gemini: ['Google', 'MyMemory'],
  Google: ['Gemini', 'MyMemory'],
  DeepL: ['Gemini', 'Google', 'MyMemory'],
  JavaSim: ['Gemini', 'Google'],
  MyMemory: [],
};

const DEEPL_LANG_MAP: Record<string, string> = {
  en: 'EN',
  ru: 'RU',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  pl: 'PL',
  pt: 'PT-BR',
  it: 'IT',
  ja: 'JA',
  'zh-cn': 'ZH',
  ko: 'KO',
};

const MYMEMORY_LOCALES: Record<string, string> = {
  en: 'en-GB',
  ru: 'ru-RU',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  pl: 'pl-PL',
  pt: 'pt-BR',
  it: 'it-IT',
  ja: 'ja-JP',
  'zh-cn': 'zh-CN',
  ko: 'ko-KR',
};

// Simple JavaSim dictionary for mock / offline / test translations
const JAVASIM_DICT: Record<string, Record<string, string>> = {
  ru: {
    'rearm': 'перевооружить',
    'approve': 'одобрить',
    'the': '',
    'plan': 'план',
    'refuse': 'отказаться',
    'and': 'и',
    'wait': 'ждать',
    'infantry': 'пехотная',
    'division': 'дивизия',
    'armored': 'бронетанковая',
    'army': 'армия',
    'of': '',
    'people': 'народа',
    'mobilise': 'мобилизовать',
    'navy': 'флот',
    'war': 'война',
    'report': 'докладывают',
    'ready': 'готов',
    'expand': 'расширяться',
    'spent': 'потрачено',
    'our': 'наши',
    'advisors': 'советники',
    'diplomats': 'дипломаты',
    'call': 'называют',
    'it': 'это',
    'incident': 'инцидентом',
    'press': 'пресса',
    'day': 'день',
  },
};

export class TranslationSession {
  public engine: TranslationEngine;
  public apiKey: string;
  public sourceLang: string;
  public targetLang: string;
  public concurrency: number;
  public reuseFallbackCache: boolean;
  public glossary: Glossary | null;
  public fallbackNotifier?: (requested: TranslationEngine, used: TranslationEngine, count: number) => void;
  public validationReport = new ValidationReport();

  private fallbackCounts: Map<string, number> = new Map();
  private abortController: AbortController = new AbortController();

  constructor(options: {
    engine: TranslationEngine;
    apiKey?: string;
    sourceLang?: string;
    targetLang?: string;
    concurrency?: number;
    reuseFallbackCache?: boolean;
    glossary?: Glossary | null;
    fallbackNotifier?: (requested: TranslationEngine, used: TranslationEngine, count: number) => void;
  }) {
    this.engine = options.engine;
    this.apiKey = options.apiKey || '';
    this.sourceLang = options.sourceLang || 'en';
    this.targetLang = options.targetLang || 'ru';
    this.concurrency = Math.max(1, options.concurrency || 4);
    this.reuseFallbackCache = Boolean(options.reuseFallbackCache);
    this.glossary = options.glossary || null;
    this.fallbackNotifier = options.fallbackNotifier;
  }

  public abort(): void {
    this.abortController.abort();
  }

  public get isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  private getCacheEngines(): TranslationEngine[] {
    if (this.reuseFallbackCache) {
      return [this.engine, ...(FALLBACK_CHAIN[this.engine] || [])];
    }
    return [this.engine];
  }

  private noteFallback(usedEngine: TranslationEngine): void {
    const pair = `${this.engine} → ${usedEngine}`;
    const count = (this.fallbackCounts.get(pair) || 0) + 1;
    this.fallbackCounts.set(pair, count);
    this.fallbackNotifier?.(this.engine, usedEngine, count);
  }

  public async translateLine(
    text: string,
    fileCtx = '',
    keyCtx = ''
  ): Promise<string> {
    if (!text || !text.trim()) return text;
    if (this.isAborted) throw new Error('Перевод прерван пользователем');

    // Check cache
    if (!this.glossary) {
      for (const cachedEngine of this.getCacheEngines()) {
        const cached = translationCache.get(
          text,
          this.sourceLang,
          this.targetLang,
          cachedEngine
        );
        if (cached !== null) {
          const issues = validate_preview_translations([text], [cached]);
          if (issues.length === 0) {
            return cached;
          }
        }
      }
    }

    const [protectedText, tokens] = protect_placeholders(text, this.glossary);
    const clean = protectedText.replace(/<<PH\d+>>/g, '').trim();
    if (!clean) {
      const restoredOnly = restore_placeholders(protectedText, tokens);
      return restoredOnly !== text ? restoredOnly : text;
    }

    const enginesToTry = [this.engine, ...(FALLBACK_CHAIN[this.engine] || [])];
    const attempts: string[] = [];
    let candidate = protectedText;
    let answered = false;

    for (const eng of enginesToTry) {
      if (this.isAborted) throw new Error('Перевод прерван');
      try {
        const rawText = await this.callEngine(eng, protectedText, this.targetLang);
        answered = true;
        candidate = restore_placeholders(rawText, tokens);

        let issues = validate_line(text, candidate);
        if (issues.length === 0) {
          candidate = PostProcessor.process(candidate, this.targetLang);
          issues = validate_line(text, candidate);
        }

        if (issues.length > 0) {
          attempts.push(`${eng}: ${issues.join('; ')}`);
          continue;
        }

        if (eng !== this.engine) {
          this.noteFallback(eng);
        }

        this.validationReport.record(fileCtx, keyCtx, [], false);
        if (candidate && candidate !== text && !this.glossary) {
          translationCache.set(
            text,
            candidate,
            this.sourceLang,
            this.targetLang,
            eng
          );
        }
        return candidate;
      } catch (err: unknown) {
        attempts.push(`${eng}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!answered) {
      throw new Error(`Все доступные движки завершились ошибкой: ${attempts.join('; ')}`);
    }

    this.validationReport.record(
      fileCtx,
      keyCtx,
      ['перевод не прошёл проверку маркеров'],
      false
    );
    throw new Error(
      `Ни один движок не вернул корректный перевод [${keyCtx}]: ${attempts.join('; ')}`
    );
  }

  private async callEngine(
    engine: TranslationEngine,
    protectedText: string,
    target: string
  ): Promise<string> {
    switch (engine) {
      case 'Gemini':
        return await this.callGemini(protectedText, target);
      case 'Google':
        return await this.callGoogle(protectedText, target);
      case 'DeepL':
        return await this.callDeepL(protectedText, target);
      case 'MyMemory':
        return await this.callMyMemory(protectedText, target);
      case 'JavaSim':
        return this.callJavaSim(protectedText, target);
      default:
        throw new Error(`Неизвестный движок: ${engine}`);
    }
  }

  private async callGemini(text: string, target: string): Promise<string> {
    const resp = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: [text],
        sourceLang: this.sourceLang,
        targetLang: target,
        apiKey: this.apiKey || undefined,
      }),
      signal: this.abortController.signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'AI request failed' }));
      throw new Error(err.error || `AI Translation HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data && Array.isArray(data.translations) && data.translations[0]) {
      return data.translations[0];
    }
    throw new Error('AI returned empty translation');
  }

  private async callGoogle(text: string, target: string): Promise<string> {
    const chunks = split_long_text(text);
    const results: string[] = [];
    const targetCode = target === 'zh-CN' ? 'zh-CN' : target.toLowerCase();

    for (const chunk of chunks) {
      if (this.isAborted) throw new Error('Прервано');
      // Try proxy first, fallback to direct endpoint if needed
      const endpoints = [
        `/api/proxy/google/translate_a/single?client=gtx&sl=${this.sourceLang}&tl=${targetCode}&dt=t&q=${encodeURIComponent(chunk)}`,
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${this.sourceLang}&tl=${targetCode}&dt=t&q=${encodeURIComponent(chunk)}`,
      ];

      let chunkResult = '';
      let success = false;
      let lastErr = null;

      for (const url of endpoints) {
        try {
          const resp = await fetch(url, {
            signal: this.abortController.signal,
          });
          if (resp.status === 429) {
            throw new Error('Google Translate rate limit (429)');
          }
          if (!resp.ok) {
            throw new Error(`Google API error status ${resp.status}`);
          }
          const data = await resp.json();
          if (Array.isArray(data) && Array.isArray(data[0])) {
            chunkResult = data[0]
              .map((item: any) => (item && item[0] ? item[0] : ''))
              .join('');
            success = true;
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!success) {
        throw lastErr || new Error('Не удалось получить ответ от Google Translate');
      }
      results.push(chunkResult);
    }

    return results.join('');
  }

  private async callDeepL(text: string, target: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Отсутствует DeepL API Key');
    }
    const targetCode = DEEPL_LANG_MAP[target.toLowerCase()] || target.toUpperCase();
    const sourceCode = (DEEPL_LANG_MAP[this.sourceLang.toLowerCase()] || this.sourceLang).toUpperCase();

    const isFree = this.apiKey.endsWith(':fx');
    const proxyPath = '/api/proxy/deepl/v2/translate';
    const directUrl = isFree
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const urls = [proxyPath, directUrl];
    let lastErr = null;

    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          },
          body: JSON.stringify({
            text: [text],
            source_lang: sourceCode,
            target_lang: targetCode,
          }),
          signal: this.abortController.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`DeepL HTTP ${resp.status}: ${errText}`);
        }

        const data = await resp.json();
        if (data && data.translations && data.translations[0]) {
          return data.translations[0].text;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('DeepL translation failed');
  }

  private async callMyMemory(text: string, target: string): Promise<string> {
    const src = MYMEMORY_LOCALES[this.sourceLang.toLowerCase()] || 'en-GB';
    const tgt = MYMEMORY_LOCALES[target.toLowerCase()] || 'ru-RU';
    const query = encodeURIComponent(text);

    const urls = [
      `/api/proxy/mymemory/get?q=${query}&langpair=${src}|${tgt}`,
      `https://api.mymemory.translated.net/get?q=${query}&langpair=${src}|${tgt}`,
    ];

    let lastErr = null;
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: this.abortController.signal });
        if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);
        const data = await resp.json();
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('MyMemory translation failed');
  }

  private callJavaSim(text: string, target: string): string {
    const dict = JAVASIM_DICT[target.toLowerCase()] || {};
    // Replace recognized words while preserving placeholders <<PH\d+>>
    return text.replace(/\b([A-Za-z]+)\b/g, (word) => {
      const lower = word.toLowerCase();
      if (lower in dict) {
        const trans = dict[lower];
        if (!trans) return '';
        // preserve capitalization
        if (word[0] === word[0].toUpperCase()) {
          return trans.charAt(0).toUpperCase() + trans.slice(1);
        }
        return trans;
      }
      return word;
    });
  }

  public async translateBatch(
    texts: string[],
    keys: string[],
    fileCtx = '',
    onProgress?: (done: number, total: number) => void
  ): Promise<string[]> {
    const total = texts.length;
    if (total === 0) return [];

    const results: string[] = new Array(total);
    let done = 0;
    const batchSize = Math.max(1, this.concurrency);

    for (let i = 0; i < total; i += batchSize) {
      if (this.isAborted) throw new Error('Перевод остановлен пользователем');

      const sliceEnd = Math.min(i + batchSize, total);
      const batchPromises: Array<Promise<{ idx: number; result: string }>> = [];

      for (let j = i; j < sliceEnd; j++) {
        const idx = j;
        const text = texts[idx];
        const key = keys[idx] || String(idx);

        batchPromises.push(
          this.translateLine(text, fileCtx, key)
            .then((res) => ({ idx, result: res }))
            .catch((err) => {
              // Return original text on validation or engine failure to let pipeline handle recovery
              return { idx, result: text };
            })
            .finally(() => {
              done++;
              onProgress?.(done, total);
            })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      for (const item of batchResults) {
        results[item.idx] = item.result;
      }
    }

    return results;
  }
}
