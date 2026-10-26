import React, { useState, useEffect } from 'react';
import { translationCache, CacheStats } from '../core/storage';

interface CacheInfoModalProps {
  onClose: () => void;
  onClear: () => void;
}

export const CacheInfoModal: React.FC<CacheInfoModalProps> = ({ onClose, onClear }) => {
  const [stats, setStats] = useState<CacheStats>({ total: 0, engines: 0, files: 0 });

  useEffect(() => {
    setStats(translationCache.getStats());
  }, []);

  const handleClear = () => {
    if (window.confirm('Очистить сохранённые переводы в кэше браузера?')) {
      translationCache.clear();
      setStats(translationCache.getStats());
      onClear();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden">
        <div className="bg-[#26292D] border-b border-[#2E3237] px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#F5A524]">Информация о кэше</h2>
          <button
            onClick={onClose}
            className="text-[#9AA0A8] hover:text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-[#9AA0A8] leading-relaxed">
            Кэш хранит валидированные переводы строк и контрольные суммы файлов
            исходников. Повторный запуск использует кэш без обращения к внешним API.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#16181B] p-3 rounded-lg border border-[#2E3237] text-center">
              <div className="text-[#9AA0A8]">Переводов</div>
              <div className="text-lg font-bold text-[#10B981] mt-1">{stats.total}</div>
            </div>
            <div className="bg-[#16181B] p-3 rounded-lg border border-[#2E3237] text-center">
              <div className="text-[#9AA0A8]">Движков</div>
              <div className="text-lg font-bold text-[#3B82F6] mt-1">{stats.engines}</div>
            </div>
            <div className="bg-[#16181B] p-3 rounded-lg border border-[#2E3237] text-center">
              <div className="text-[#9AA0A8]">Файлов</div>
              <div className="text-lg font-bold text-[#F5A524] mt-1">{stats.files}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#26292D] border-t border-[#2E3237] px-6 py-3 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 text-xs px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Очистить кэш
          </button>
          <button
            onClick={onClose}
            className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-4 py-1.5 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
