import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { CustomWord } from '../services/customVocab.service';

const COLUMNS = ['word', 'translateEn', 'translateCh', 'sentence', 'phonetics'] as const;
const ROW_LIMIT = 500;
const PREVIEW_ROWS = 10;

const SAMPLE_ROW = {
  word: 'apple',
  translateEn: 'apple / a round fruit',
  translateCh: '蘋果',
  sentence: 'I eat an apple every day.',
  phonetics: '/ˈæp.əl/',
};

function downloadSample(format: 'xlsx' | 'csv') {
  const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: [...COLUMNS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'words');
  XLSX.writeFile(wb, `heloword_vocab_sample.${format}`);
}

type ParsedRow = Partial<Record<typeof COLUMNS[number], string>>;

function parseSheet(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  // normalise header names: trim + lowercase for matching
  return raw.map((r) => {
    const out: ParsedRow = {};
    for (const col of COLUMNS) {
      // try exact, then case-insensitive
      const key =
        Object.keys(r).find((k) => k === col) ??
        Object.keys(r).find((k) => k.trim().toLowerCase() === col.toLowerCase()) ??
        '';
      out[col] = key ? String(r[key] ?? '').trim() : '';
    }
    return out;
  });
}

type ImportRow = Omit<CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>;

interface Props {
  onClose: () => void;
  onImport: (rows: ImportRow[]) => Promise<void>;
}

const ImportVocabModal: React.FC<Props> = ({ onClose, onImport }) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setRows([]);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const parsed = parseSheet(wb);

        if (parsed.length === 0) {
          setError(t('userVocab.importEmpty'));
          return;
        }
        if (parsed.length > ROW_LIMIT) {
          setError(t('userVocab.importTooMany', { limit: ROW_LIMIT, count: parsed.length }));
          setRows(parsed.slice(0, ROW_LIMIT));
          return;
        }
        setRows(parsed);
      } catch {
        setError(t('userVocab.importParseError'));
      }
    };
    reader.readAsBinaryString(file);
  };

  const validRows = rows.filter((r) => r.word?.trim() && r.translateEn?.trim());

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(
        validRows.map((r): ImportRow => ({
          word: r.word!.trim(),
          translateEn: r.translateEn!.trim(),
          translateCh: r.translateCh?.trim() || undefined,
          sentence: r.sentence?.trim() || undefined,
          phonetics: r.phonetics?.trim() || undefined,
        }))
      );
      onClose();
    } catch (e: any) {
      const msg = e?.message === 'WORD_LIMIT_EXCEEDED' ? t('userVocab.wordLimitReached') : (e?.message || t('userVocab.importParseError'));
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  const previewRows = rows.slice(0, PREVIEW_ROWS);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line shrink-0">
          <h2 className="text-base font-semibold text-ink">{t('userVocab.importTitle')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-ink/5 transition-colors">
            <svg className="w-5 h-5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Sample download */}
          <div className="bg-accent-soft rounded-2xl p-4 space-y-3">
            <p className="text-sm font-medium text-accent">{t('userVocab.importSampleHint')}</p>

            {/* Column descriptions */}
            <div className="space-y-1.5">
              {([
                ['word',        true,  t('userVocab.colWord')],
                ['translateEn', true,  t('userVocab.colTranslateEn')],
                ['translateCh', false, t('userVocab.colTranslateCh')],
                ['sentence',    false, t('userVocab.colSentence')],
                ['phonetics',   false, t('userVocab.colPhonetics')],
              ] as [string, boolean, string][]).map(([col, required, desc]) => (
                <div key={col} className="flex items-start gap-2 text-xs">
                  <span className="font-mono font-semibold text-accent shrink-0 w-28">{col}</span>
                  <span className={`shrink-0 px-1 rounded text-[10px] font-medium ${required ? 'bg-accent-soft text-accent ' : 'bg-ink/10 text-ink-muted '}`}>
                    {required ? t('userVocab.colRequired') : t('userVocab.colOptional')}
                  </span>
                  <span className="text-accent">{desc}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => downloadSample('xlsx')}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('userVocab.downloadSampleExcel')}
              </button>
              <button
                onClick={() => downloadSample('csv')}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('userVocab.downloadSampleCsv')}
              </button>
            </div>
          </div>

          {/* File picker */}
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-line rounded-2xl py-6 flex flex-col items-center gap-2 hover:border-accent transition-colors"
            >
              <svg className="w-8 h-8 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-ink-muted">
                {fileName || t('userVocab.importPickFile')}
              </span>
              <span className="text-xs text-ink-faint">.xlsx · .xls · .csv — {t('userVocab.importLimit', { limit: ROW_LIMIT })}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-danger bg-danger-soft rounded-xl px-4 py-2">{error}</p>
          )}

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  {t('userVocab.importPreview', { shown: previewRows.length, total: rows.length })}
                </p>
                <p className="text-xs text-ink-faint">
                  {t('userVocab.importValid', { count: validRows.length })}
                  {rows.length > validRows.length && (
                    <span className="text-accent ml-1">
                      ({t('userVocab.importSkipped', { count: rows.length - validRows.length })})
                    </span>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-muted">
                      {COLUMNS.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const isInvalid = !row.word?.trim() || !row.translateEn?.trim();
                      return (
                        <tr
                          key={i}
                          className={`border-t border-line ${isInvalid ? 'bg-danger-soft ' : ''}`}
                        >
                          {COLUMNS.map((col) => (
                            <td key={col} className="px-3 py-2 text-ink max-w-[120px] truncate">
                              {row[col] || <span className="text-ink-faint">—</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_ROWS && (
                <p className="text-xs text-ink-faint text-center">
                  {t('userVocab.importMoreRows', { count: rows.length - PREVIEW_ROWS })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-line flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-line text-sm font-medium text-ink-muted hover:bg-paper transition-colors"
          >
            {t('review.cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={validRows.length === 0 || importing}
            className="flex-1 py-3 rounded-2xl bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper text-sm font-semibold transition-colors"
          >
            {importing ? '…' : t('userVocab.importConfirm', { count: validRows.length })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImportVocabModal;
