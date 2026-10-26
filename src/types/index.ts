export type TranslationEngine = 'Gemini' | 'Google' | 'DeepL' | 'MyMemory' | 'JavaSim';

export type BrokenLineMode = 'reject_file' | 'keep_original';

export interface LocalisationLine {
  lineIndex: number;
  originalText: string;
  prefix: string; // e.g. " demo.1.t:0 "
  key: string;    // normalized key without revision, e.g. "demo.1.t"
  rawKey: string; // prefix trimmed, e.g. "demo.1.t:0"
  value: string;  // value inside quotes
  suffix: string; // trailing comment or whitespace
  lineEnding: string;
}

export interface FileEntry {
  id: string;
  path: string; // relative path e.g. "localisation/english/demo_events_l_english.yml"
  filename: string;
  content: string;
  size?: number;
}

export interface ProcessedFileResult {
  sourcePath: string;
  destinationPath: string;
  status: 'written' | 'rejected' | 'cancelled' | 'error';
  message: string;
  translatedCount: number;
  skippedCount: number;
  staleCount: number;
  recoveredCount: number;
  brokenCount: number;
  reusedCount: number;
  content: string;
  brokenDetails?: Array<{
    key: string;
    issues: string[];
    recovered: boolean;
  }>;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  tag?: 'info' | 'warning' | 'error' | 'success';
}

export interface ValidationBrokenItem {
  file: string;
  key: string;
  issues: string[];
}

export interface TranslatorSettings {
  engine: TranslationEngine;
  sourceLang: string;
  targetLang: string;
  apiKey: string;
  concurrency: number;
  skipTranslated: boolean;
  openOutput: boolean;
  preview: boolean;
  reuseFallbackCache: boolean;
  brokenLinesMode: BrokenLineMode;
}
