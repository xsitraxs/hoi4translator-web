import React, { useState } from 'react';
import { validate_preview_translations } from '../core/validation';

interface PreviewModalProps {
  filename: string;
  originals: string[];
  translations: string[];
  onAccept: (edited: string[]) => void;
  onCancel: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  filename,
  originals,
  translations,
  onAccept,
  onCancel,
}) => {
  const MAX_PREVIEW_ROWS = 1000;
  const shownCount = Math.min(originals.length, MAX_PREVIEW_ROWS);

  const [entries, setEntries] = useState<string[]>(() =>
    translations.slice(0, MAX_PREVIEW_ROWS)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleEntryChange = (index: number, val: string) => {
    const updated = [...entries];
    updated[index] = val;
    setEntries(updated);
  };

  const handleSave = () => {
    // Visible rows are edited; remaining rows keep engine output
    const fullList = [...entries, ...translations.slice(entries.length)];
    const issues = validate_preview_translations(originals, fullList);

    if (issues.length > 0) {
      const shownIssues = issues.slice(0, 10);
      let details = shownIssues.join('\n');
      if (issues.length > shownIssues.length) {
        details += `\n… и ещё ${issues.length - shownIssues.length} строк(и)`;
      }
      setErrorMessage(`Нарушены игровые плейсхолдеры:\n\n${details}`);
      return;
    }

    setErrorMessage(null);
    onAccept(fullList);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#26292D] border-b border-[#2E3237] px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold text-[#F5A524]">
              Предпросмотр: {filename}
            </span>
          </div>
          <span className="text-xs text-[#9AA0A8] font-mono">
            {shownCount < originals.length
              ? `показаны первые ${shownCount} из ${originals.length} строк`
              : `${originals.length} строк`}
          </span>
        </div>

        {/* Validation Error Alert if any */}
        {errorMessage && (
          <div className="bg-red-950/80 border-b border-red-800 text-red-200 px-6 py-2.5 text-xs whitespace-pre-wrap font-mono flex items-start justify-between">
            <div>{errorMessage}</div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Column Headers */}
        <div className="grid grid-cols-2 gap-4 px-6 py-2.5 bg-[#16181B] border-b border-[#2E3237] text-xs font-bold">
          <div className="text-[#3B82F6]">Оригинал</div>
          <div className="text-[#10B981]">Перевод (можно редактировать)</div>
        </div>

        {/* Scrollable Rows */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2 font-mono text-xs">
          {originals.slice(0, MAX_PREVIEW_ROWS).map((orig, idx) => (
            <div
              key={idx}
              className="grid grid-cols-2 gap-4 items-center py-1.5 border-b border-[#2A2E33]/60 hover:bg-[#26292D]/40 rounded px-1"
            >
              <div
                className="text-[#9AA0A8] break-all truncate"
                title={orig}
              >
                <span className="text-[#6B7280] mr-2 select-none">{idx + 1}.</span>
                {orig}
              </div>
              <div>
                <input
                  type="text"
                  value={entries[idx] || ''}
                  onChange={(e) => handleEntryChange(idx, e.target.value)}
                  className="w-full bg-[#16181B] border border-[#353A40] focus:border-[#F5A524] focus:outline-hidden text-[#ECEEF1] px-2.5 py-1 rounded text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Hint banner */}
        <div className="py-2 text-center text-xs text-[#9AA0A8] bg-[#16181B]/80 border-t border-[#2E3237]">
          💡 Отредактируй любую строку перевода, затем нажми «Сохранить»
        </div>

        {/* Footer Buttons */}
        <div className="bg-[#26292D] border-t border-[#2E3237] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              className="bg-[#F5A524] hover:bg-[#FFBE45] text-[#16181B] font-bold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              ✔ Сохранить и записать файл
            </button>
            <button
              onClick={onCancel}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-2 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
            >
              ✘ Отмена (не записывать)
            </button>
          </div>
          <span className="text-xs text-[#6B7280] font-mono">
            Файл: {filename}
          </span>
        </div>
      </div>
    </div>
  );
};
