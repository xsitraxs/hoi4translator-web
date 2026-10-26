import React from 'react';
import { RunReport } from '../core/report';

interface ReportModalProps {
  report: RunReport;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ report, onClose }) => {
  const summary = report.summary;

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    downloadFile(
      report.toJSON(),
      `hoi4_translator_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      'application/json'
    );
  };

  const handleDownloadCSV = () => {
    downloadFile(
      report.toCSV(),
      `hoi4_translator_report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1E2023] border border-[#2E3237] rounded-xl shadow-2xl flex flex-col w-full max-w-4xl h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-[#26292D] border-b border-[#2E3237] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#F5A524]">
              Отчёт о прогоне перевода
            </h2>
            <p className="text-xs text-[#9AA0A8] mt-0.5">
              Время: {new Date(report.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadJSON}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-3 py-1.5 rounded border border-[#3B4147] transition-colors cursor-pointer"
            >
              Скачать JSON
            </button>
            <button
              onClick={handleDownloadCSV}
              className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-3 py-1.5 rounded border border-[#3B4147] transition-colors cursor-pointer"
            >
              Скачать CSV
            </button>
            <button
              onClick={onClose}
              className="text-[#9AA0A8] hover:text-white px-2 py-1 text-sm font-bold cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-6 gap-2 p-4 bg-[#16181B] border-b border-[#2E3237] text-center text-xs">
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Файлов</div>
            <div className="text-base font-bold text-[#ECEEF1] mt-0.5">
              {summary.writtenFiles}/{summary.totalFiles}
            </div>
          </div>
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Переведено</div>
            <div className="text-base font-bold text-[#10B981] mt-0.5">
              {summary.totalTranslated}
            </div>
          </div>
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Пропущено</div>
            <div className="text-base font-bold text-[#3B82F6] mt-0.5">
              {summary.totalSkipped}
            </div>
          </div>
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Из ванили</div>
            <div className="text-base font-bold text-[#A855F7] mt-0.5">
              {summary.totalReused}
            </div>
          </div>
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Заменено</div>
            <div className="text-base font-bold text-[#F5A524] mt-0.5">
              {summary.totalRecovered}
            </div>
          </div>
          <div className="bg-[#1E2023] p-2.5 rounded border border-[#2E3237]">
            <div className="text-[#9AA0A8]">Битых</div>
            <div className="text-base font-bold text-[#EF4444] mt-0.5">
              {summary.totalBroken}
            </div>
          </div>
        </div>

        {/* Content Tabs / Scrollable Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-[#F5A524] uppercase tracking-wider mb-2">
              Обработанные файлы ({report.files.length})
            </h3>
            <div className="overflow-x-auto border border-[#2E3237] rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#26292D] text-[#9AA0A8]">
                  <tr>
                    <th className="p-2 border-b border-[#2E3237]">Файл</th>
                    <th className="p-2 border-b border-[#2E3237]">Статус</th>
                    <th className="p-2 border-b border-[#2E3237]">Переведено</th>
                    <th className="p-2 border-b border-[#2E3237]">Пропущено</th>
                    <th className="p-2 border-b border-[#2E3237]">Ваниль</th>
                    <th className="p-2 border-b border-[#2E3237]">Битые</th>
                    <th className="p-2 border-b border-[#2E3237]">Инфо</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3237]/60 font-mono">
                  {report.files.map((f, i) => (
                    <tr key={i} className="hover:bg-[#26292D]/40">
                      <td className="p-2 text-[#ECEEF1] font-semibold">{f.file}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            f.status === 'written'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : f.status === 'cancelled'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-red-950 text-red-400 border border-red-800'
                          }`}
                        >
                          {f.status}
                        </span>
                      </td>
                      <td className="p-2 text-[#10B981]">{f.translated}</td>
                      <td className="p-2 text-[#3B82F6]">{f.skipped}</td>
                      <td className="p-2 text-[#A855F7]">{f.reused}</td>
                      <td className="p-2 text-[#EF4444]">{f.broken}</td>
                      <td className="p-2 text-[#9AA0A8] max-w-xs truncate" title={f.message}>
                        {f.message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.broken.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[#EF4444] uppercase tracking-wider mb-2">
                Список битых строк ({report.broken.length})
              </h3>
              <div className="overflow-x-auto border border-[#2E3237] rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#26292D] text-[#9AA0A8]">
                    <tr>
                      <th className="p-2 border-b border-[#2E3237]">Файл</th>
                      <th className="p-2 border-b border-[#2E3237]">Ключ</th>
                      <th className="p-2 border-b border-[#2E3237]">Проблемы</th>
                      <th className="p-2 border-b border-[#2E3237]">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E3237]/60 font-mono">
                    {report.broken.map((b, i) => (
                      <tr key={i} className="hover:bg-[#26292D]/40">
                        <td className="p-2 text-[#9AA0A8]">{b.file}</td>
                        <td className="p-2 text-[#ECEEF1]">{b.key}</td>
                        <td className="p-2 text-[#EF4444]">{b.issues.join(', ')}</td>
                        <td className="p-2">
                          {b.recovered ? (
                            <span className="text-[#F5A524]">Заменена оригиналом</span>
                          ) : (
                            <span className="text-[#EF4444]">Файл отклонён</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#26292D] border-t border-[#2E3237] px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#2A2E33] hover:bg-[#343941] text-[#ECEEF1] text-xs px-5 py-2 rounded-lg border border-[#3B4147] transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
