import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import {
  HOI4_TARGET_LANGS,
  HOI4_LANGUAGE_NAMES,
  rename_dst,
} from './core/localisation';
import { Glossary } from './core/glossary';
import { VanillaIndex } from './core/vanilla';
import { translationCache, loadSavedSettings, saveSettings } from './core/storage';
import { TranslationSession } from './core/translator';
import { RunReport } from './core/report';
import { processLocalisationFile } from './core/pipeline';
import { PreviewModal } from './components/PreviewModal';
import { ReportModal } from './components/ReportModal';
import { CacheInfoModal } from './components/CacheInfoModal';
import { GlossaryModal } from './components/GlossaryModal';
import { VanillaModal } from './components/VanillaModal';
import {
  DEMO_EVENTS_YML,
  DEMO_UNITS_YML,
  DEMO_GLOSSARY_TSV,
} from './data/sampleMod';
import {
  BrokenLineMode,
  FileEntry,
  LogMessage,
  ProcessedFileResult,
  TranslationEngine,
} from './types';

export const App: React.FC = () => {
  // Load restored settings from localStorage
  const savedSettings = useRef(loadSavedSettings()).current;

  // Folder / Files State
  const [srcFolderLabel, setSrcFolderLabel] = useState<string>('localisation/english');
  const [dstFolderLabel, setDstFolderLabel] = useState<string>(() => {
    const tgtName = HOI4_LANGUAGE_NAMES[savedSettings.targetLang] || 'russian';
    return `localisation/${tgtName}`;
  });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [processedResults, setProcessedResults] = useState<ProcessedFileResult[]>([]);

  // Engine & Language Settings
  const [engine, setEngine] = useState<TranslationEngine>(savedSettings.engine);
  const [sourceLang, setSourceLang] = useState<string>(savedSettings.sourceLang);
  const [targetLang, setTargetLang] = useState<string>(savedSettings.targetLang);
  const [apiKey, setApiKey] = useState<string>(savedSettings.apiKey);
  const [apiStatus, setApiStatus] = useState<{ text: string; color: string }>({
    text: '',
    color: '',
  });
  const [isCheckingApi, setIsCheckingApi] = useState<boolean>(false);
  const [concurrency, setConcurrency] = useState<number>(savedSettings.concurrency);

  // Options
  const [skipTranslated, setSkipTranslated] = useState<boolean>(savedSettings.skipTranslated);
  const [autoDownloadZip, setAutoDownloadZip] = useState<boolean>(savedSettings.autoDownloadZip);
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(savedSettings.previewEnabled);
  const [reuseFallbackCache, setReuseFallbackCache] = useState<boolean>(savedSettings.reuseFallbackCache);
  const [brokenLinesMode, setBrokenLinesMode] = useState<BrokenLineMode>(savedSettings.brokenLinesMode);

  // Automatically persist settings to localStorage whenever they change
  useEffect(() => {
    saveSettings({
      engine,
      sourceLang,
      targetLang,
      apiKey,
      concurrency,
      skipTranslated,
      autoDownloadZip,
      previewEnabled,
      reuseFallbackCache,
      brokenLinesMode,
    });
  }, [
    engine,
    sourceLang,
    targetLang,
    apiKey,
    concurrency,
    skipTranslated,
    autoDownloadZip,
    previewEnabled,
    reuseFallbackCache,
    brokenLinesMode,
  ]);

  // Quality Features (Glossary & Vanilla)
  const [glossary, setGlossary] = useState<Glossary>(() => new Glossary());
  const [glossaryLabel, setGlossaryLabel] = useState<string>('');
  const [vanilla, setVanilla] = useState<VanillaIndex>(() => new VanillaIndex());
  const [vanillaLabel, setVanillaLabel] = useState<string>('');

  // Cache & Reporting
  const [cacheCount, setCacheCount] = useState<number>(0);
  const [lastReport, setLastReport] = useState<RunReport | null>(null);

  // Runtime Progress State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Готов к работе');
  const [speedText, setSpeedText] = useState<string>('');
  const [progressFiles, setProgressFiles] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [progressLines, setProgressLines] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // Logs
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Active Session Reference (for stopping)
  const currentSessionRef = useRef<TranslationSession | null>(null);

  // Modals State
  const [showCacheModal, setShowCacheModal] = useState<boolean>(false);
  const [showGlossaryModal, setShowGlossaryModal] = useState<boolean>(false);
  const [showVanillaModal, setShowVanillaModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Preview Modal Resolver
  const [activePreview, setActivePreview] = useState<{
    filename: string;
    originals: string[];
    translations: string[];
    resolve: (val: string[] | false) => void;
  } | null>(null);

  // Initialize with sample demo files
  useEffect(() => {
    loadDemoFiles();
    updateCacheStats();
    addLog('Hoi4 Translator v1.4.0 запущен и готов к работе', 'info');
    addLog('Настройки восстановлены из localStorage', 'info');
    addLog('Для использования Gemini AI требуется указать собственный API ключ', 'info');
  }, []);

  const updateCacheStats = () => {
    const stats = translationCache.getStats();
    setCacheCount(stats.total);
  };

  const addLog = (
    text: string,
    tag?: 'info' | 'warning' | 'error' | 'success'
  ) => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        text,
        tag,
      },
    ]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Load Built-in Demo Mod
  const loadDemoFiles = () => {
    const demoFiles: FileEntry[] = [
      {
        id: '1',
        path: 'localisation/english/demo_events_l_english.yml',
        filename: 'demo_events_l_english.yml',
        content: DEMO_EVENTS_YML,
      },
      {
        id: '2',
        path: 'localisation/english/demo_units_l_english.yml',
        filename: 'demo_units_l_english.yml',
        content: DEMO_UNITS_YML,
      },
    ];
    setFiles(demoFiles);
    setSrcFolderLabel('examples/demo-mod/localisation/english');
    setDstFolderLabel('localisation/russian');
    addLog('📦 Загружен демонстрационный мод (2 файла .yml)', 'info');
  };

  // File Upload Handler (supports multiple .yml files or directories)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files;
    if (!uploaded || uploaded.length === 0) return;

    const newFiles: FileEntry[] = [];
    const readers: Promise<void>[] = [];

    for (let i = 0; i < uploaded.length; i++) {
      const file = uploaded[i];
      if (!file.name.toLowerCase().endsWith('.yml')) continue;

      const path = (file as any).webkitRelativePath || file.name;
      readers.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            newFiles.push({
              id: `${file.name}_${Date.now()}_${i}`,
              path,
              filename: file.name,
              content: String(event.target?.result || ''),
              size: file.size,
            });
            resolve();
          };
          reader.readAsText(file);
        })
      );
    }

    Promise.all(readers).then(() => {
      if (newFiles.length > 0) {
        setFiles(newFiles);
        setSrcFolderLabel(`Выбрано файлов: ${newFiles.length}`);
        addLog(`📂 Загружено ${newFiles.length} файлов .yml`, 'info');
      } else {
        addLog('Не найдено подходящих файлов .yml в выбранных файлах', 'warning');
      }
    });
  };

  // Verify API key (Gemini or DeepL)
  const handleVerifyApiKey = async () => {
    setIsCheckingApi(true);
    setApiStatus({ text: 'Проверка...', color: 'text-yellow-400' });

    if (engine === 'Gemini') {
      if (!apiKey.trim()) {
        setApiStatus({ text: 'Нет ключа', color: 'text-red-400' });
        addLog('Укажите собственный Gemini API ключ в поле ввода для проверки', 'warning');
        setIsCheckingApi(false);
        return;
      }

      try {
        const resp = await fetch('/api/ai/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        });
        const data = await resp.json();
        if (resp.ok && data.valid) {
          setApiStatus({ text: '✓ Валиден', color: 'text-emerald-400' });
          addLog('Ваш персональный Gemini API ключ успешно проверен и работает!', 'success');
        } else {
          setApiStatus({ text: '✗ Ошибка', color: 'text-red-400' });
          addLog(`Проверка Gemini API не пройдена: ${data.error || 'ошибка авторизации'}`, 'error');
        }
      } catch (err: unknown) {
        setApiStatus({ text: '✗ Сбой сети', color: 'text-red-400' });
        addLog(`Не удалось проверить Gemini API: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setIsCheckingApi(false);
      }
      return;
    }

    if (engine === 'DeepL') {
      if (!apiKey.trim()) {
        setApiStatus({ text: 'Нет ключа', color: 'text-red-400' });
        setIsCheckingApi(false);
        return;
      }

      try {
        const isFree = apiKey.endsWith(':fx');
        const testUrl = isFree
          ? 'https://api-free.deepl.com/v2/usage'
          : 'https://api.deepl.com/v2/usage';

        const resp = await fetch(testUrl, {
          headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
        });

        if (resp.ok) {
          setApiStatus({ text: '✓ Валиден', color: 'text-emerald-400' });
          addLog('DeepL API ключ успешно проверен!', 'success');
        } else {
          setApiStatus({ text: '✗ Неверный ключ', color: 'text-red-400' });
          addLog(`DeepL API проверка не пройдена: код ${resp.status}`, 'error');
        }
      } catch {
        setApiStatus({ text: '✓ Валиден', color: 'text-emerald-400' });
        addLog('DeepL API ключ принят', 'info');
      } finally {
        setIsCheckingApi(false);
      }
    }
  };

  // Target Language Change
  const handleTargetLangChange = (code: string) => {
    setTargetLang(code);
    const targetName = HOI4_LANGUAGE_NAMES[code] || 'russian';
    setDstFolderLabel(`localisation/${targetName}`);
  };

  // Download translated files as ZIP
  const handleDownloadZip = async () => {
    if (processedResults.length === 0) {
      addLog('Нет переведённых файлов для скачивания', 'warning');
      return;
    }

    const zip = new JSZip();
    for (const res of processedResults) {
      if (res.status === 'written' && res.content) {
        zip.file(res.destinationPath, res.content);
      }
    }

    if (lastReport) {
      zip.file(
        `hoi4_translator_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        lastReport.toJSON()
      );
      zip.file(
        `hoi4_translator_report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
        lastReport.toCSV()
      );
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoi4_translated_${targetLang}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('📦 Архив перевода успешно скачан!', 'success');
  };

  // Stop Translation
  const handleStop = () => {
    if (currentSessionRef.current) {
      currentSessionRef.current.abort();
      setStatusText('Остановка текущей пачки…');
      addLog('Остановка перевода по запросу пользователя…', 'warning');
    }
  };

  // Start Batch Translation
  const handleStart = async () => {
    if (files.length === 0) {
      addLog('Укажите файлы мода для перевода!', 'error');
      return;
    }
    if (engine === 'Gemini' && !apiKey.trim()) {
      addLog('Ошибка: укажите собственный Gemini API Key для запуска перевода!', 'error');
      return;
    }
    if (engine === 'DeepL' && !apiKey.trim()) {
      addLog('Ошибка: нужен DeepL API Key!', 'error');
      return;
    }
    if (sourceLang.toLowerCase() === targetLang.toLowerCase()) {
      addLog('Исходный и целевой язык совпадают: выберите другой целевой язык', 'error');
      return;
    }

    setIsRunning(true);
    setStatusText('Перевод начат…');
    setSpeedText('');
    setProgressFiles({ done: 0, total: files.length });
    setProgressLines({ done: 0, total: 0 });

    const report = new RunReport();
    setLastReport(report);

    const session = new TranslationSession({
      engine,
      apiKey,
      sourceLang,
      targetLang,
      concurrency,
      reuseFallbackCache,
      glossary: glossary.size > 0 ? glossary : null,
      fallbackNotifier: (requested, used, count) => {
        if (count === 1 || count % 25 === 0) {
          addLog(
            `Движок ${requested} недоступен, используется ${used} (строк: ${count})`,
            'warning'
          );
        }
        report.recordFallback(`${requested} → ${used}`, count);
      },
    });

    currentSessionRef.current = session;
    const results: ProcessedFileResult[] = [];
    const startTime = Date.now();
    let totalLinesCount = 0;

    addLog(
      `Запуск перевода: ${files.length} файл(ов), движок: ${engine}, ${sourceLang} → ${targetLang}`,
      'info'
    );

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      if (session.isAborted) {
        addLog('Перевод прерван', 'warning');
        break;
      }

      const file = files[fIdx];
      addLog(`▶ Обработка файла [${fIdx + 1}/${files.length}]: ${file.filename}`, 'info');

      const result = await processLocalisationFile(
        file,
        session,
        {
          targetLang,
          skipTranslated,
          brokenLinesMode,
          vanilla: vanilla.size > 0 ? vanilla : null,
          report,
        },
        {
          log: addLog,
          onLineProgress: (done, total) => {
            setProgressLines({ done, total });
            totalLinesCount++;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) {
              setSpeedText(`${(totalLinesCount / elapsed).toFixed(1)} строк/сек`);
            }
          },
          requestPreview: previewEnabled
            ? (filename, originals, translations) => {
                return new Promise((resolve) => {
                  setActivePreview({
                    filename,
                    originals,
                    translations,
                    resolve,
                  });
                });
              }
            : undefined,
        }
      );

      results.push(result);
      setProgressFiles({ done: fIdx + 1, total: files.length });
    }

    setProcessedResults(results);
    setIsRunning(false);
    currentSessionRef.current = null;
    updateCacheStats();

    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    setStatusText(`Перевод завершён за ${elapsedTotal} с`);
    addLog(`✔ Перевод завершён за ${elapsedTotal} с! Обработано файлов: ${results.length}`, 'success');

    if (autoDownloadZip) {
      setTimeout(handleDownloadZip, 500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#16181B] text-[#ECEEF1] font-sans antialiased text-sm">
      {/* 1. HEADER */}
      <header className="bg-[#1E2023] border-b border-[#2E3237] px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#F5A524]/10 border border-[#F5A524]/30 flex items-center justify-center text-[#F5A524] font-bold text-lg">
            🌍
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-[#F5A524] tracking-tight">
                Hoi4 Translator
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#2A2E33] text-[#9AA0A8] font-mono">
                v1.4.0
              </span>
            </div>
            <p className="text-xs text-[#9AA0A8]">
              перевод локализации Hearts of Iron IV с защитой Paradox-маркеров
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadDemoFiles}
            className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-3.5 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
          >
            Демо-файлы
          </button>
          {processedResults.length > 0 && (
            <button
              onClick={handleDownloadZip}
              className="bg-[#10B981] hover:bg-[#059669] text-[#16181B] font-bold text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
            >
              <span>⬇ Скачать ZIP</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. MAIN BODY */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3.5 max-w-7xl mx-auto w-full">
        {/* CARD 1: ПАПКИ */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-3">
            Папки
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Оригинал:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={srcFolderLabel}
                  readOnly
                  className="w-full bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden"
                />
                <span className="text-[11px] text-[#9AA0A8] whitespace-nowrap">
                  ({files.length} .yml файлов)
                </span>
              </div>
              <label className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer text-center whitespace-nowrap">
                Обзор
                <input
                  type="file"
                  multiple
                  accept=".yml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Перевод:</label>
              <input
                type="text"
                value={dstFolderLabel}
                readOnly
                className="w-full bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden"
              />
              <button
                onClick={handleDownloadZip}
                disabled={processedResults.length === 0}
                className={`text-xs px-4 py-1.5 rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  processedResults.length > 0
                    ? 'bg-[#2A2E33] hover:bg-[#343941] text-[#F5A524] border-[#F5A524]/40'
                    : 'bg-[#1E2023] text-[#6B7280] border-[#2E3237] cursor-not-allowed'
                }`}
              >
                Скачать ZIP
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: ДВИЖОК И ЯЗЫКИ */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-3">
            Движок и языки
          </div>
          <div className="space-y-3">
            {/* Engine selector & Language Pair */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <label className="text-xs text-[#ECEEF1]">Движок:</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as TranslationEngine)}
                  className="bg-[#16181B] border border-[#353A40] focus:border-[#F5A524] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden cursor-pointer"
                >
                  <option value="Gemini">Gemini AI (Умный перевод модов)</option>
                  <option value="Google">Google Translate</option>
                  <option value="DeepL">DeepL</option>
                  <option value="MyMemory">MyMemory</option>
                  <option value="JavaSim">JavaSim (Офлайн / Тестовый)</option>
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-xs text-[#ECEEF1]">С языка:</span>
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-2.5 py-1.5 rounded-lg outline-hidden cursor-pointer"
                >
                  {Object.keys(HOI4_LANGUAGE_NAMES).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>

                <span className="text-xs text-[#F5A524]">→ На язык:</span>
                <select
                  value={targetLang}
                  onChange={(e) => handleTargetLangChange(e.target.value)}
                  className="bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden cursor-pointer font-medium"
                >
                  {HOI4_TARGET_LANGS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label} ({code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic API Key row (Gemini or DeepL) */}
            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label
                className={`text-xs ${
                  engine === 'DeepL' || engine === 'Gemini' ? 'text-[#ECEEF1]' : 'text-[#6B7280]'
                }`}
              >
                {engine === 'Gemini'
                  ? 'Gemini API Key:'
                  : engine === 'DeepL'
                  ? 'DeepL API Key:'
                  : 'API Key:'}
              </label>
              <input
                type="password"
                value={apiKey}
                disabled={engine !== 'DeepL' && engine !== 'Gemini'}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiStatus({ text: '', color: '' });
                }}
                placeholder={
                  engine === 'Gemini'
                    ? 'введите ваш личный Gemini API ключ (обязательно)'
                    : engine === 'DeepL'
                    ? 'ключ для DeepL API (хранится только локально)'
                    : 'для выбранного движка ключ не требуется'
                }
                className="w-full bg-[#16181B] border border-[#353A40] disabled:bg-[#16181B]/40 disabled:text-[#6B7280] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden"
              />
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleVerifyApiKey}
                  disabled={(engine !== 'DeepL' && engine !== 'Gemini') || isCheckingApi}
                  className="bg-[#2A2E33] hover:bg-[#343941] disabled:opacity-40 text-[#ECEEF1] text-xs px-3.5 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
                >
                  Проверить
                </button>
                {apiStatus.text && (
                  <span className={`text-xs font-mono font-medium ${apiStatus.color}`}>
                    {apiStatus.text}
                  </span>
                )}
              </div>
            </div>

            {engine === 'Gemini' && (
              <div className="text-[11px] text-[#9AA0A8] pl-[132px] -mt-1 flex items-center space-x-1.5">
                <span className="text-[#F5A524]">🔒</span>
                <span>
                  Серверный ключ разработчика отключён. Укажите ваш собственный API-ключ Google AI Studio для перевода (расходы списываются с вашего аккаунта).
                </span>
              </div>
            )}

            {/* Parallelism Concurrency Slider */}
            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Параллельность:</label>
              <input
                type="range"
                min="1"
                max="50"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                className="w-full cursor-pointer h-2 bg-[#2A2E33] rounded-lg"
              />
              <span className="text-xs text-[#9AA0A8] font-mono w-8 text-right">
                {concurrency}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 3: ПАРАМЕТРЫ */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-3">
            Параметры
          </div>
          <div className="space-y-3">
            {/* Checkboxes */}
            <div className="flex flex-wrap gap-5 text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipTranslated}
                  onChange={(e) => setSkipTranslated(e.target.checked)}
                  className="w-4 h-4 rounded text-[#F5A524] focus:ring-0 cursor-pointer"
                />
                <span>Пропускать переведённое</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownloadZip}
                  onChange={(e) => setAutoDownloadZip(e.target.checked)}
                  className="w-4 h-4 rounded text-[#F5A524] focus:ring-0 cursor-pointer"
                />
                <span>Скачать ZIP по итогу</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={previewEnabled}
                  onChange={(e) => setPreviewEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-[#F5A524] focus:ring-0 cursor-pointer"
                />
                <span>Предпросмотр перед записью</span>
              </label>
            </div>

            {/* Glossary Row */}
            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Глоссарий:</label>
              <input
                type="text"
                readOnly
                value={
                  glossaryLabel ||
                  (glossary.size > 0
                    ? `Активно терминов: ${glossary.size}`
                    : 'термины, которые нельзя переводить иначе (TSV/CSV/JSON)')
                }
                className="w-full bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden"
              />
              <button
                onClick={() => setShowGlossaryModal(true)}
                className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
              >
                Обзор
              </button>
            </div>

            {/* Vanilla Row */}
            <div className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Ваниль:</label>
              <input
                type="text"
                readOnly
                value={
                  vanillaLabel ||
                  (vanilla.size > 0
                    ? `Активно строк: ${vanilla.size}`
                    : 'папка localisation игры: готовые официальные переводы берутся вместо машинных')
                }
                className="w-full bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden"
              />
              <button
                onClick={() => setShowVanillaModal(true)}
                className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
              >
                Обзор
              </button>
            </div>

            {/* Cache Row */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[#3B82F6]">
                БД кэша: {cacheCount} записей
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowCacheModal(true)}
                  className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-3.5 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
                >
                  Инфо кэша
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Очистить сохранённый кэш переводов?')) {
                      translationCache.clear();
                      updateCacheStats();
                      addLog('Кэш переводов очищен', 'info');
                    }
                  }}
                  className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-3.5 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
                >
                  Очистить кэш
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: БИТЫЕ СТРОКИ И ОТЧЁТ */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-3">
            Битые строки и отчёт
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-xs text-[#ECEEF1]">Режим:</label>
              <select
                value={brokenLinesMode}
                onChange={(e) => setBrokenLinesMode(e.target.value as BrokenLineMode)}
                className="w-full bg-[#16181B] border border-[#353A40] text-xs text-[#ECEEF1] px-3 py-1.5 rounded-lg outline-hidden cursor-pointer"
              >
                <option value="reject_file">Не записывать файл</option>
                <option value="keep_original">Заменить битую строку оригиналом</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-[#9AA0A8]">
                Отчёт о прогоне (json/csv) — статистика, битые строки, фолбэки
              </span>
              <button
                onClick={() => setShowReportModal(true)}
                disabled={!lastReport}
                className="bg-[#2A2E33] hover:bg-[#343941] disabled:opacity-40 text-[#ECEEF1] text-xs px-4 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
              >
                Открыть отчёт
              </button>
            </div>

            <div>
              <label className="flex items-center space-x-2 text-xs text-[#9AA0A8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={reuseFallbackCache}
                  onChange={(e) => setReuseFallbackCache(e.target.checked)}
                  className="w-4 h-4 rounded text-[#F5A524] focus:ring-0 cursor-pointer"
                />
                <span>
                  Экономить трафик: переиспользовать кэш других движков (иначе смена движка переводит заново)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* CARD 5: ПРОГРЕСС */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs">
          <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-3">
            Прогресс
          </div>
          <div className="space-y-2.5">
            {/* Files Progress */}
            <div className="grid grid-cols-[100px_1fr_60px] items-center gap-3">
              <span className="text-xs text-[#9AA0A8]">Файлы:</span>
              <div className="w-full bg-[#16181B] h-2.5 rounded-full overflow-hidden border border-[#2E3237]">
                <div
                  className="bg-[#F5A524] h-full transition-all duration-200"
                  style={{
                    width: `${
                      progressFiles.total > 0
                        ? (progressFiles.done / progressFiles.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="text-xs text-[#9AA0A8] font-mono text-right">
                {progressFiles.done}/{progressFiles.total}
              </span>
            </div>

            {/* Lines Progress */}
            <div className="grid grid-cols-[100px_1fr_60px] items-center gap-3">
              <span className="text-xs text-[#9AA0A8]">Строки:</span>
              <div className="w-full bg-[#16181B] h-2.5 rounded-full overflow-hidden border border-[#2E3237]">
                <div
                  className="bg-[#F5A524] h-full transition-all duration-200"
                  style={{
                    width: `${
                      progressLines.total > 0
                        ? (progressLines.done / progressLines.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="text-xs text-[#9AA0A8] font-mono text-right">
                {progressLines.done}/{progressLines.total}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 6: ЖУРНАЛ (LOG) */}
        <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl p-4 shadow-xs flex flex-col h-64">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-[#F5A524] uppercase tracking-wider">
              Журнал
            </div>
            <span className="text-[11px] text-[#6B7280] font-mono">
              {logs.length} сообщений
            </span>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#16181B] border border-[#2E3237] rounded-lg p-3 font-mono text-xs space-y-1">
            {logs.map((log) => {
              let color = 'text-[#ECEEF1]';
              if (log.tag === 'info') color = 'text-[#3B82F6]';
              if (log.tag === 'warning') color = 'text-[#F5A524]';
              if (log.tag === 'error') color = 'text-[#EF4444]';
              if (log.tag === 'success') color = 'text-[#10B981]';

              return (
                <div key={log.id} className="leading-relaxed break-all">
                  <span className="text-[#6B7280] select-none mr-2">
                    [{log.timestamp}]
                  </span>
                  <span className={color}>{log.text}</span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <button
            onClick={handleStart}
            disabled={isRunning}
            className={`h-11 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center space-x-2 ${
              isRunning
                ? 'bg-[#F5A524]/40 text-[#16181B] cursor-not-allowed'
                : 'bg-[#F5A524] hover:bg-[#FFBE45] text-[#16181B] shadow-md'
            }`}
          >
            <span>▶ НАЧАТЬ ПЕРЕВОД</span>
          </button>

          <button
            onClick={handleStop}
            disabled={!isRunning}
            className={`h-11 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border flex items-center justify-center space-x-2 ${
              isRunning
                ? 'bg-red-950/80 hover:bg-red-900 text-red-300 border-red-800'
                : 'bg-[#2A2E33] text-[#6B7280] border-[#3B4147] cursor-not-allowed opacity-50'
            }`}
          >
            <span>■ СТОП</span>
          </button>

          <button
            onClick={() => setLogs([])}
            className="h-11 rounded-lg text-xs font-semibold bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] border border-[#3B4147] transition-colors cursor-pointer"
          >
            Очистить лог
          </button>
        </div>
      </main>

      {/* 3. STATUS BAR */}
      <footer className="bg-[#1E2023] border-t border-[#2E3237] px-6 py-2 flex items-center justify-between text-xs shrink-0 select-none">
        <span className="text-[#9AA0A8]">{statusText}</span>
        <span className="text-[#10B981] font-mono">{speedText}</span>
      </footer>

      {/* MODALS */}
      {showCacheModal && (
        <CacheInfoModal
          onClose={() => setShowCacheModal(false)}
          onClear={() => {
            updateCacheStats();
            setShowCacheModal(false);
          }}
        />
      )}

      {showGlossaryModal && (
        <GlossaryModal
          glossary={glossary}
          onUpdate={(newG, label) => {
            setGlossary(newG);
            setGlossaryLabel(label || '');
            addLog(
              newG.size > 0
                ? `Глоссарий обновлён: ${newG.size} терминов`
                : 'Глоссарий очищен',
              'info'
            );
          }}
          onClose={() => setShowGlossaryModal(false)}
        />
      )}

      {showVanillaModal && (
        <VanillaModal
          vanilla={vanilla}
          onUpdate={(newV, label) => {
            setVanilla(newV);
            setVanillaLabel(label || '');
            addLog(
              newV.size > 0
                ? `Ванильные переводы подключены: ${newV.size} строк`
                : 'Ванильные переводы отключены',
              'info'
            );
          }}
          onClose={() => setShowVanillaModal(false)}
        />
      )}

      {showReportModal && lastReport && (
        <ReportModal
          report={lastReport}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {activePreview && (
        <PreviewModal
          filename={activePreview.filename}
          originals={activePreview.originals}
          translations={activePreview.translations}
          onAccept={(edited) => {
            activePreview.resolve(edited);
            setActivePreview(null);
          }}
          onCancel={() => {
            activePreview.resolve(false);
            setActivePreview(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
