// File-level translation pipeline: parse, check duplicates, vanilla reuse, translate, validate, recover, format.

import {
  prepare_target_localisation_lines,
  split_value_line,
  split_line_ending,
  normalize_key,
  source_text_hash,
  rename_dst,
  build_output_lines,
  get_hoi4_language_name,
} from './localisation';
import {
  validate_pairs,
  split_row_issues,
} from './validation';
import { TranslationSession } from './translator';
import { VanillaIndex } from './vanilla';
import { RunReport } from './report';
import { translationCache } from './storage';
import { BrokenLineMode, FileEntry, ProcessedFileResult } from '../types';

export const RECOVERED_HASH_MARKER = '';

export interface ProcessFileCallbacks {
  log: (message: string, tag?: 'info' | 'warning' | 'error' | 'success') => void;
  onLineProgress?: (done: number, total: number) => void;
  requestPreview?: (
    filename: string,
    originals: string[],
    translations: string[]
  ) => Promise<string[] | false>;
}

export async function processLocalisationFile(
  file: FileEntry,
  session: TranslationSession,
  options: {
    targetLang: string;
    skipTranslated: boolean;
    brokenLinesMode: BrokenLineMode;
    vanilla?: VanillaIndex | null;
    report?: RunReport;
  },
  callbacks: ProcessFileCallbacks
): Promise<ProcessedFileResult> {
  const { targetLang, skipTranslated, brokenLinesMode, vanilla, report } = options;
  const { log, onLineProgress, requestPreview } = callbacks;

  const targetName = get_hoi4_language_name(targetLang);
  const dstPath = rename_dst(file.path, targetLang);
  const relPath = file.path;

  const rawLines = file.content.split(/\r?\n/).map((l) => l + '\n');
  if (rawLines.length > 0 && file.content.endsWith('\n') === false) {
    rawLines[rawLines.length - 1] = rawLines[rawLines.length - 1].slice(0, -1);
  }

  const prepared = prepare_target_localisation_lines(
    rawLines,
    targetName,
    session.sourceLang,
    log
  );

  if (!prepared) {
    report?.recordFile({
      file: relPath,
      destination: dstPath,
      status: 'rejected',
      translated: 0,
      skipped: 0,
      stale: 0,
      recovered: 0,
      broken: 0,
      reused: 0,
      message: 'не совпал исходный язык',
    });
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'rejected',
      message: 'не совпал исходный язык',
      translatedCount: 0,
      skippedCount: 0,
      staleCount: 0,
      recoveredCount: 0,
      brokenCount: 0,
      reusedCount: 0,
      content: '',
    };
  }

  const { lines, headerIndexes, structureChanged } = prepared;
  const outLines = [...lines];

  const toTranslateIdx: number[] = [];
  const toTranslateVal: string[] = [];
  const toTranslateKeys: string[] = [];
  const meta: Array<[string, string, string]> = [];

  let skipped = 0;
  let reusedVanilla = 0;
  const staleSourceKeys: string[] = [];
  const unverifiableKeys: string[] = [];
  const malformedLines: number[] = [];
  const keyLineNumbers: Record<string, number[]> = {};
  const fileKeyHashes: Record<string, string> = {};

  const recordedHashes = skipTranslated
    ? translationCache.getSourceHashes(dstPath)
    : {};

  for (let i = 0; i < lines.length; i++) {
    if (session.isAborted) {
      return {
        sourcePath: file.path,
        destinationPath: dstPath,
        status: 'cancelled',
        message: 'остановлено пользователем',
        translatedCount: 0,
        skippedCount: 0,
        staleCount: 0,
        recoveredCount: 0,
        brokenCount: 0,
        reusedCount: 0,
        content: '',
      };
    }

    if (headerIndexes.has(i)) continue;

    const [lineContent, lineEnding] = split_line_ending(lines[i]);
    const parts = split_value_line(lineContent);
    if (!parts) {
      const stripped = lineContent.trim();
      if (stripped && !stripped.startsWith('#') && stripped.includes(':')) {
        malformedLines.push(i + 1);
      }
      continue;
    }

    const [prefix, value, suffix] = parts;
    const rawKey = prefix.trim();
    const key = normalize_key(prefix);

    if (!keyLineNumbers[key]) keyLineNumbers[key] = [];
    keyLineNumbers[key].push(i + 1);

    const hash = await source_text_hash(value);
    fileKeyHashes[key] = hash;

    // Check if previously translated in cache
    if (skipTranslated) {
      const knownHash = recordedHashes[key] || recordedHashes[rawKey];
      const cachedVal = translationCache.get(value, session.sourceLang, targetLang, session.engine);
      if (cachedVal !== null) {
        if (knownHash === RECOVERED_HASH_MARKER) {
          // Previously repaired, re-translate
        } else if (knownHash && knownHash !== hash) {
          staleSourceKeys.push(key);
        } else {
          outLines[i] = `${prefix}"${cachedVal}"${suffix}${lineEnding}`;
          skipped++;
          continue;
        }
      }
    }

    // Check Vanilla reuse
    if (vanilla) {
      const reusedVal = vanilla.lookup(value) || vanilla.lookupByKey(key);
      if (reusedVal) {
        outLines[i] = `${prefix}"${reusedVal}"${suffix}${lineEnding}`;
        reusedVanilla++;
        continue;
      }
    }

    toTranslateIdx.push(i);
    toTranslateVal.push(value);
    toTranslateKeys.push(key);
    meta.push([prefix, suffix, lineEnding]);
  }

  if (malformedLines.length > 0) {
    const rows = malformedLines.slice(0, 10).join(', ');
    log(
      `  Файл пропущен: строки ${rows} не соответствуют формату локализации (ключ:"значение"); проверьте ключи и кавычки`,
      'error'
    );
    report?.recordFile({
      file: relPath,
      destination: dstPath,
      status: 'rejected',
      translated: 0,
      skipped,
      stale: staleSourceKeys.length,
      recovered: 0,
      broken: malformedLines.length,
      reused: reusedVanilla,
      message: 'строки не соответствуют формату',
    });
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'rejected',
      message: 'строки не соответствуют формату',
      translatedCount: 0,
      skippedCount: skipped,
      staleCount: staleSourceKeys.length,
      recoveredCount: 0,
      brokenCount: malformedLines.length,
      reusedCount: reusedVanilla,
      content: '',
    };
  }

  // Check duplicate keys
  const duplicateKeys = Object.entries(keyLineNumbers).filter(
    ([, rows]) => rows.length > 1
  );
  if (duplicateKeys.length > 0) {
    const details = duplicateKeys
      .slice(0, 10)
      .map(([k, rows]) => `${k} (строки ${rows.join(', ')})`)
      .join('; ');
    log(
      `  Файл не записан: повторяющиеся localization keys: ${details}`,
      'error'
    );
    report?.recordFile({
      file: relPath,
      destination: dstPath,
      status: 'rejected',
      translated: 0,
      skipped,
      stale: staleSourceKeys.length,
      recovered: 0,
      broken: duplicateKeys.length,
      reused: reusedVanilla,
      message: 'повторяющиеся ключи',
    });
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'rejected',
      message: 'повторяющиеся ключи',
      translatedCount: 0,
      skippedCount: skipped,
      staleCount: staleSourceKeys.length,
      recoveredCount: 0,
      brokenCount: duplicateKeys.length,
      reusedCount: reusedVanilla,
      content: '',
    };
  }

  const total = toTranslateVal.length;
  if (total === 0) {
    const finalContent = build_output_lines(outLines, [], [], []);
    translationCache.setSourceHashes(dstPath, fileKeyHashes);
    if (staleSourceKeys.length > 0) {
      log(`  Исходник изменился у ${staleSourceKeys.length} строк; перевод обновлён`, 'info');
    }
    if (skipped > 0) {
      log(`  Пропущено (уже переведено): ${skipped}`, 'info');
    }
    if (reusedVanilla > 0) {
      log(`  Из ванильного перевода: ${reusedVanilla}`, 'info');
    }
    report?.recordFile({
      file: relPath,
      destination: dstPath,
      status: 'written',
      translated: 0,
      skipped,
      stale: staleSourceKeys.length,
      recovered: 0,
      broken: 0,
      reused: reusedVanilla,
      message: 'все строки актуальны',
    });
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'written',
      message: 'все строки актуальны',
      translatedCount: 0,
      skippedCount: skipped,
      staleCount: staleSourceKeys.length,
      recoveredCount: 0,
      brokenCount: 0,
      reusedCount: reusedVanilla,
      content: finalContent,
    };
  }

  // Execute batch translation
  let translatedVals: string[] = [];
  try {
    translatedVals = await session.translateBatch(
      toTranslateVal,
      toTranslateKeys,
      relPath,
      onLineProgress
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`  Ошибка перевода: ${errMsg}`, 'error');
    report?.recordFile({
      file: relPath,
      destination: dstPath,
      status: 'error',
      translated: 0,
      skipped,
      stale: staleSourceKeys.length,
      recovered: 0,
      broken: 0,
      reused: reusedVanilla,
      message: errMsg,
    });
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'error',
      message: errMsg,
      translatedCount: 0,
      skippedCount: skipped,
      staleCount: staleSourceKeys.length,
      recoveredCount: 0,
      brokenCount: 0,
      reusedCount: reusedVanilla,
      content: '',
    };
  }

  if (session.isAborted) {
    return {
      sourcePath: file.path,
      destinationPath: dstPath,
      status: 'cancelled',
      message: 'остановлено пользователем',
      translatedCount: 0,
      skippedCount: skipped,
      staleCount: staleSourceKeys.length,
      recoveredCount: 0,
      brokenCount: 0,
      reusedCount: reusedVanilla,
      content: '',
    };
  }

  let approvedValues = [...translatedVals];

  // Preview step
  if (requestPreview) {
    const previewResult = await requestPreview(
      file.filename,
      toTranslateVal,
      translatedVals
    );
    if (previewResult === false) {
      log('  Предпросмотр отменён: файл не записан', 'warning');
      report?.recordFile({
        file: relPath,
        destination: dstPath,
        status: 'cancelled',
        translated: 0,
        skipped,
        stale: staleSourceKeys.length,
        recovered: 0,
        broken: 0,
        reused: reusedVanilla,
        message: 'предпросмотр отменён',
      });
      return {
        sourcePath: file.path,
        destinationPath: dstPath,
        status: 'cancelled',
        message: 'предпросмотр отменён',
        translatedCount: 0,
        skippedCount: skipped,
        staleCount: staleSourceKeys.length,
        recoveredCount: 0,
        brokenCount: 0,
        reusedCount: reusedVanilla,
        content: '',
      };
    }
    approvedValues = previewResult;
  }

  // Row-level validation and broken-line recovery
  const rowIssues = validate_pairs(toTranslateVal, approvedValues);
  const brokenIndexes: number[] = [];
  const introducedRows: Record<number, string[]> = {};
  const inheritedRows: Record<number, string[]> = {};

  rowIssues.forEach((issues, index) => {
    if (issues.length > 0) {
      brokenIndexes.push(index);
      const { inherited, introduced } = split_row_issues(toTranslateVal[index], issues);
      if (introduced.length > 0) {
        introducedRows[index] = introduced;
      } else {
        inheritedRows[index] = inherited;
      }
    }
  });

  // Report inherited issues
  for (const [idxStr, issues] of Object.entries(inheritedRows)) {
    const idx = parseInt(idxStr, 10);
    const key = toTranslateKeys[idx];
    log(`  Строка [${key}] записана как есть, проблема в исходнике: ${issues.join(', ')}`, 'warning');
    report?.recordBroken(relPath, key, issues, false);
  }

  const recoveredKeys: string[] = [];
  const brokenDetails: Array<{ key: string; issues: string[]; recovered: boolean }> = [];

  if (Object.keys(introducedRows).length > 0) {
    if (brokenLinesMode !== 'keep_original') {
      const problems = Object.entries(introducedRows)
        .slice(0, 5)
        .map(([idxStr, issues]) => `Строка ${parseInt(idxStr, 10) + 1}: ${issues.join(', ')}`)
        .join('; ');
      log(`  Файл не записан: перевод нарушает формат локализации: ${problems}`, 'error');
      report?.recordFile({
        file: relPath,
        destination: dstPath,
        status: 'rejected',
        translated: 0,
        skipped,
        stale: staleSourceKeys.length,
        recovered: 0,
        broken: Object.keys(introducedRows).length,
        reused: reusedVanilla,
        message: 'перевод нарушает формат',
      });
      return {
        sourcePath: file.path,
        destinationPath: dstPath,
        status: 'rejected',
        message: 'перевод нарушает формат',
        translatedCount: 0,
        skippedCount: skipped,
        staleCount: staleSourceKeys.length,
        recoveredCount: 0,
        brokenCount: Object.keys(introducedRows).length,
        reusedCount: reusedVanilla,
        content: '',
      };
    }

    // Keep original for broken lines
    for (const [idxStr, issues] of Object.entries(introducedRows)) {
      const idx = parseInt(idxStr, 10);
      const key = toTranslateKeys[idx];
      log(`  Строка [${key}] заменена оригиналом: ${issues.join(', ')}`, 'warning');
      recoveredKeys.push(key);
      approvedValues[idx] = toTranslateVal[idx];
      report?.recordBroken(relPath, key, issues, true);
      brokenDetails.push({ key, issues, recovered: true });
      fileKeyHashes[key] = RECOVERED_HASH_MARKER;
    }
    log(
      `  Битых строк заменено оригиналом: ${recoveredKeys.length} (исправьте их вручную)`,
      'warning'
    );
  }

  // Build final output with UTF-8 BOM
  const finalContent = build_output_lines(
    outLines,
    toTranslateIdx,
    approvedValues,
    meta
  );

  translationCache.setSourceHashes(dstPath, fileKeyHashes);

  if (staleSourceKeys.length > 0) {
    log(`  Исходник изменился у ${staleSourceKeys.length} строк; перевод обновлён`, 'info');
  }
  if (skipped > 0) {
    log(`  Пропущено (уже переведено): ${skipped}`, 'info');
  }
  if (reusedVanilla > 0) {
    log(`  Из ванильного перевода: ${reusedVanilla}`, 'info');
  }

  report?.recordFile({
    file: relPath,
    destination: dstPath,
    status: 'written',
    translated: total,
    skipped,
    stale: staleSourceKeys.length,
    recovered: recoveredKeys.length,
    broken: Object.keys(introducedRows).length,
    reused: reusedVanilla,
    message: '',
  });

  return {
    sourcePath: file.path,
    destinationPath: dstPath,
    status: 'written',
    message: '',
    translatedCount: total,
    skippedCount: skipped,
    staleCount: staleSourceKeys.length,
    recoveredCount: recoveredKeys.length,
    brokenCount: Object.keys(introducedRows).length,
    reusedCount: reusedVanilla,
    content: finalContent,
    brokenDetails,
  };
}
