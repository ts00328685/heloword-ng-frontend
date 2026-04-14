import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomWord, parsePhotoWords } from '../services/customVocab.service';

type ParsedRow = {
  word: string;
  translateEn: string;
  translateCh: string;
  sentence: string;
  phonetics: string;
};

type ImportRow = Omit<CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>;

interface Props {
  onClose: () => void;
  onImport: (rows: ImportRow[]) => Promise<void>;
}

const COLUMNS: { key: keyof ParsedRow; label: string; required: boolean; width: string }[] = [
  { key: 'word',        label: 'word',        required: true,  width: 'min-w-[100px]' },
  { key: 'translateEn', label: 'translateEn',  required: true,  width: 'min-w-[140px]' },
  { key: 'translateCh', label: 'translateCh',  required: false, width: 'min-w-[100px]' },
  { key: 'sentence',    label: 'sentence',     required: false, width: 'min-w-[160px]' },
  { key: 'phonetics',   label: 'phonetics',    required: false, width: 'min-w-[100px]' },
];

const PhotoParseModal: React.FC<Props> = ({ onClose, onImport }) => {
  const { t } = useTranslation();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoSelected = async (file: File) => {
    setError('');
    setRows([]);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setParsing(true);
    try {
      const parsed = await parsePhotoWords(file);
      if (parsed.length === 0) {
        setError(t('userVocab.photoNoWords'));
        return;
      }
      setRows(
        parsed.map((p) => ({
          word:        (p as any).word        ?? '',
          translateEn: (p as any).translateEn ?? '',
          translateCh: (p as any).translateCh ?? '',
          sentence:    (p as any).sentence    ?? '',
          phonetics:   (p as any).phonetics   ?? '',
        }))
      );
    } catch (e: any) {
      setError(e?.message || t('userVocab.photoParseError'));
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoSelected(file);
    e.target.value = '';
  };

  const updateRow = (idx: number, field: keyof ParsedRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const validRows = rows.filter((r) => r.word.trim() && r.translateEn.trim());

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(
        validRows.map((r): ImportRow => ({
          word:        r.word.trim(),
          translateEn: r.translateEn.trim(),
          translateCh: r.translateCh.trim() || undefined,
          sentence:    r.sentence.trim()    || undefined,
          phonetics:   r.phonetics.trim()   || undefined,
        }))
      );
      onClose();
    } catch (e: any) {
      const msg =
        e?.message === 'WORD_LIMIT_EXCEEDED'
          ? t('userVocab.wordLimitReached')
          : e?.message || t('userVocab.photoParseError');
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  const resetPhoto = () => {
    setRows([]);
    setPreview('');
    setError('');
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('userVocab.photoImportTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Photo selection — shown when no rows yet and not parsing */}
          {!parsing && rows.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('userVocab.photoImportHint')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                >
                  <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {t('userVocab.photoPickGallery')}
                  </span>
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                >
                  <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {t('userVocab.photoTakePhoto')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Parsing state */}
          {parsing && (
            <div className="flex flex-col items-center gap-4 py-10">
              {preview && (
                <img
                  src={preview}
                  className="max-h-44 rounded-xl object-contain shadow-md"
                  alt="preview"
                />
              )}
              <div className="w-8 h-8 border-[3px] border-purple-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('userVocab.photoAnalyzing')}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Parsed results — editable table */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {/* Photo thumbnail + re-select */}
              {preview && (
                <div className="flex items-center justify-between">
                  <img src={preview} className="h-10 rounded-lg object-contain" alt="photo" />
                  <button
                    onClick={resetPhoto}
                    className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                  >
                    {t('userVocab.photoReselect')}
                  </button>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('userVocab.photoResults', { count: rows.length })}
                </p>
                <p className="text-xs text-gray-400">
                  {t('userVocab.importValid', { count: validRows.length })}
                  {rows.length > validRows.length && (
                    <span className="text-orange-400 ml-1">
                      ({t('userVocab.importSkipped', { count: rows.length - validRows.length })})
                    </span>
                  )}
                </p>
              </div>

              {/* Editable table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap ${col.width}`}
                        >
                          {col.label}
                          {col.required && <span className="text-red-400 ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const isInvalid = !row.word.trim() || !row.translateEn.trim();
                      return (
                        <tr
                          key={idx}
                          className={`border-t border-gray-100 dark:border-gray-800 ${
                            isInvalid ? 'bg-red-50 dark:bg-red-900/10' : ''
                          }`}
                        >
                          {COLUMNS.map((col) => (
                            <td key={col.key} className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row[col.key]}
                                onChange={(e) => updateRow(idx, col.key, e.target.value)}
                                className={`w-full px-2 py-1 rounded-lg border text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                                  col.required && !row[col.key].trim()
                                    ? 'border-red-300 dark:border-red-700'
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                                placeholder={col.required ? col.label : '—'}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => deleteRow(idx)}
                              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                              aria-label="Delete row"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('review.cancel')}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleSave}
              disabled={validRows.length === 0 || importing}
              className="flex-1 py-3 rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
            >
              {importing ? '…' : t('userVocab.importConfirm', { count: validRows.length })}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PhotoParseModal;
