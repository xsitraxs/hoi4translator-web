import React, { useState } from 'react';
import { Glossary } from '../core/glossary';
import { DEMO_GLOSSARY_TSV } from '../data/sampleMod';

interface GlossaryModalProps {
  glossary: Glossary;
  onUpdate: (newGlossary: Glossary, filename?: string) => void;
  onClose: () => void;
}

export const GlossaryModal: React.FC<GlossaryModalProps> = ({
  glossary,
  onUpdate,
  onClose,
}) => {
  const [text, setText] = useState<string>(() => {
    const entries = glossary.getAllEntries();
    if (entries.length === 0) return '';
    return entries.map((e) => `${e.term}\t${e.translation}`).join('\n');
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setText(content);
      const newG = new Glossary(content);
      onUpdate(newG, file.name);
    };
    reader.readAsText(file);
  };

  const handleLoadDemo = () => {
    setText(DEMO_GLOSSARY_TSV);
    const newG = new Glossary(DEMO_GLOSSARY_TSV);
    onUpdate(newG, 'glossary-example.tsv');
  };

  const handleApply = () => {
    const newG = new Glossary(text);
    onUpdate(newG, text.trim() ? 'пользовательский глоссарий' : '');
    onClose();
  };

  const handleClear = () => {
    setText('');
    onUpdate(new Glossary(), '');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl shadow-2xl flex flex-col w-full max-w-2xl h-[75vh] overflow-hidden">
        <div className="bg-[#26292D] border-b border-[#2E3237] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-[#F5A524]">
              Глоссарий терминов
            </h2>
            <span className="text-xs text-[#9AA0A8] font-mono">
              ({glossary.size} терминов)
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#9AA0A8] hover:text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-4 bg-[#16181B] border-b border-[#2E3237] flex flex-wrap gap-2 text-xs items-center justify-between">
          <div className="flex items-center space-x-2">
            <label className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] px-3 py-1.5 rounded border border-[#3B4147] transition-colors cursor-pointer">
              Загрузить файл (TSV/CSV/JSON)
              <input
                type="file"
                accept=".tsv,.csv,.json,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleLoadDemo}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#F5A524] px-3 py-1.5 rounded border border-[#3B4147] transition-colors cursor-pointer"
            >
              Загрузить пример HoI4
            </button>
          </div>
          <button
            onClick={handleClear}
            className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
          >
            Очистить
          </button>
        </div>

        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          <p className="text-xs text-[#9AA0A8] mb-2">
            Формат: <code className="text-[#F5A524]">Термин &lt;TAB&gt; Перевод</code> (или CSV/JSON).
            Термины маскируются перед отправкой в переводчик и вставляются уже переведёнными.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Division\tДивизия\nInfantry\tПехотная\nSoviet Union\tСоветский Союз`}
            className="flex-1 w-full bg-[#16181B] border border-[#353A40] focus:border-[#F5A524] focus:outline-hidden text-[#ECEEF1] font-mono text-xs p-3 rounded-lg resize-none"
          />
        </div>

        <div className="bg-[#26292D] border-t border-[#2E3237] px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-[#6B7280]">
            Совпадения ищутся целыми словами, регистр не важен
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-2 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              onClick={handleApply}
              className="bg-[#F5A524] hover:bg-[#FFBE45] text-[#16181B] font-bold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Применить глоссарий
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
