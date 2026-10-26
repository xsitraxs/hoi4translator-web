import React, { useState } from 'react';
import { VanillaIndex } from '../core/vanilla';
import { DEMO_VANILLA_EN, DEMO_VANILLA_RU } from '../data/sampleMod';

interface VanillaModalProps {
  vanilla: VanillaIndex;
  onUpdate: (newVanilla: VanillaIndex, label: string) => void;
  onClose: () => void;
}

export const VanillaModal: React.FC<VanillaModalProps> = ({
  vanilla,
  onUpdate,
  onClose,
}) => {
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [loadedCount, setLoadedCount] = useState(vanilla.size);

  const handleLoadDemo = () => {
    setSourceText(DEMO_VANILLA_EN);
    setTargetText(DEMO_VANILLA_RU);
    const newV = new VanillaIndex();
    const count = newV.addFilePair(DEMO_VANILLA_EN, DEMO_VANILLA_RU);
    setLoadedCount(count);
    onUpdate(newV, 'демо-ваниль (demo-vanilla)');
  };

  const handleApply = () => {
    if (!sourceText.trim() || !targetText.trim()) {
      if (!sourceText.trim() && !targetText.trim()) {
        onUpdate(new VanillaIndex(), '');
        onClose();
        return;
      }
      alert('Укажите оба файла: исходный файл игры и файл с официальным переводом.');
      return;
    }
    const newV = new VanillaIndex();
    const count = newV.addFilePair(sourceText, targetText);
    setLoadedCount(count);
    onUpdate(newV, `ваниль (${count} строк)`);
    onClose();
  };

  const handleClear = () => {
    setSourceText('');
    setTargetText('');
    setLoadedCount(0);
    onUpdate(new VanillaIndex(), '');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl shadow-2xl flex flex-col w-full max-w-3xl h-[80vh] overflow-hidden">
        <div className="bg-[#26292D] border-b border-[#2E3237] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-[#F5A524]">
              Ванильные переводы (базовая игра)
            </h2>
            <span className="text-xs text-[#9AA0A8] font-mono">
              ({loadedCount} строк в базе)
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#9AA0A8] hover:text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-4 bg-[#16181B] border-b border-[#2E3237] flex items-center justify-between text-xs">
          <p className="text-[#9AA0A8]">
            Строки мода, скопированные из базовой игры, берут официальный перевод без использования машинных движков.
          </p>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={handleLoadDemo}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#F5A524] px-3 py-1.5 rounded border border-[#3B4147] transition-colors cursor-pointer whitespace-nowrap"
            >
              Загрузить пример HoI4
            </button>
            <button
              onClick={handleClear}
              className="text-red-400 hover:text-red-300 text-xs cursor-pointer whitespace-nowrap"
            >
              Сброс
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 grid grid-cols-2 gap-4 overflow-hidden">
          <div className="flex flex-col h-full overflow-hidden">
            <span className="text-xs font-semibold text-[#3B82F6] mb-1">
              Оригинал базовой игры (напр. english)
            </span>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder='l_english:&#10; infantry_division:0 "Infantry Division"&#10; ...'
              className="flex-1 w-full bg-[#16181B] border border-[#353A40] focus:border-[#F5A524] focus:outline-hidden text-[#ECEEF1] font-mono text-xs p-3 rounded-lg resize-none"
            />
          </div>
          <div className="flex flex-col h-full overflow-hidden">
            <span className="text-xs font-semibold text-[#10B981] mb-1">
              Официальный перевод (напр. russian)
            </span>
            <textarea
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder='l_russian:&#10; infantry_division:0 "Пехотная дивизия"&#10; ...'
              className="flex-1 w-full bg-[#16181B] border border-[#353A40] focus:border-[#F5A524] focus:outline-hidden text-[#ECEEF1] font-mono text-xs p-3 rounded-lg resize-none"
            />
          </div>
        </div>

        <div className="bg-[#26292D] border-t border-[#2E3237] px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-[#6B7280]">
            Совпадения сверяются по ключам и точному тексту оригинала
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
              Применить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
