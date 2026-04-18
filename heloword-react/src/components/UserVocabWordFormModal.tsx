import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomWord } from '../services/customVocab.service';
import { getWordFill } from '../services/llm.service';
import { Sentence } from '../models';

interface WordFormData {
  word: string;
  translateEn: string;
  translateCh: string;
  sentence: string;
  phonetics: string;
  sourceWordId?: number;
  sourceTableName?: string;
}

interface BulkRow {
  word: string;
  translateEn: string;
  translateCh: string;
  sentence: string;
  aiLoading: boolean;
}

const EMPTY_ROW = (): BulkRow => ({ word: '', translateEn: '', translateCh: '', sentence: '', aiLoading: false });
const DEFAULT_BULK_COUNT = 10;

interface Props {
  initial?: Partial<WordFormData>;
  onClose: () => void;
  onSave: (data: WordFormData) => Promise<void>;
  onBatchSave?: (data: WordFormData[]) => Promise<void>;
  /** System word list to search from — passed in from the parent page */
  systemWords?: Sentence[];
  /** Language of the parent custom group (e.g. 'JA', 'EN') */
  language?: string;
}

const UserVocabWordFormModal: React.FC<Props> = ({ initial, onClose, onSave, onBatchSave, systemWords, language }) => {
  const { t } = useTranslation();

  // Mode toggle — only available in add mode (no initial word)
  const canBulk = !initial?.word && !!onBatchSave;
  const [bulkMode, setBulkMode] = useState(false);

  // ── Single mode state ──────────────────────────────────────────────────────
  const [word, setWord] = useState(initial?.word ?? '');
  const [translateEn, setTranslateEn] = useState(initial?.translateEn ?? '');
  const [translateCh, setTranslateCh] = useState(initial?.translateCh ?? '');
  const [sentence, setSentence] = useState(initial?.sentence ?? '');
  const [phonetics, setPhonetics] = useState(initial?.phonetics ?? '');
  const [sourceWordId, setSourceWordId] = useState(initial?.sourceWordId);
  const [sourceTableName, setSourceTableName] = useState(initial?.sourceTableName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showSystemSearch, setShowSystemSearch] = useState(false);
  const [systemQuery, setSystemQuery] = useState('');

  // ── Bulk mode state ────────────────────────────────────────────────────────
  const [rows, setRows] = useState<BulkRow[]>(() =>
    Array.from({ length: DEFAULT_BULK_COUNT }, EMPTY_ROW)
  );
  const [bulkAiAllLoading, setBulkAiAllLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  // ── Single mode handlers ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!word.trim()) { setError(t('userVocab.wordRequired', 'Word is required')); return; }
    if (!translateEn.trim()) { setError(t('userVocab.meaningRequired', 'Meaning is required')); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ word: word.trim(), translateEn: translateEn.trim(), translateCh: translateCh.trim(), sentence: sentence.trim(), phonetics: phonetics.trim(), sourceWordId, sourceTableName });
      onClose();
    } catch (e: any) {
      const msg = e?.message === 'WORD_LIMIT_EXCEEDED' ? t('userVocab.wordLimitReached') : (e?.message || 'Error');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const wordLang = language ? language.toLowerCase() : 'en';

  const handleAiFill = async () => {
    if (!word.trim()) { setError(t('userVocab.wordRequired', 'Word is required to use AI Fill')); return; }
    setAiLoading(true);
    setError('');
    try {
      const result = await getWordFill(word.trim(), wordLang);
      if (!translateEn.trim()) setTranslateEn(result.translateEn);
      if (!translateCh.trim()) setTranslateCh(result.translateCh);
      if (!sentence.trim()) setSentence(result.sentence);
    } catch (e: any) {
      setError(t('llm.error'));
    } finally {
      setAiLoading(false);
    }
  };

  const filteredSystem = systemWords
    ? systemWords.filter((w) => {
        const q = systemQuery.toLowerCase();
        return q && (
          (w.word || '').toLowerCase().includes(q) ||
          (w.translateEn || '').toLowerCase().includes(q)
        );
      }).slice(0, 20)
    : [];

  const fillFromSystem = (sw: Sentence) => {
    setWord(sw.word || sw.sentence || '');
    setTranslateEn(sw.translateEn || '');
    setTranslateCh(sw.translateCh || '');
    setSentence(sw.sentence && sw.word ? sw.sentence : '');
    setPhonetics('');
    setSourceWordId(sw.id);
    setSourceTableName(sw.tableName || undefined);
    setShowSystemSearch(false);
    setSystemQuery('');
  };

  // ── Bulk mode handlers ─────────────────────────────────────────────────────
  const updateRow = (idx: number, field: keyof Omit<BulkRow, 'aiLoading'>, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    setRows((prev) => [...prev, EMPTY_ROW()]);
  };

  const handleBulkAiFillRow = async (idx: number) => {
    const rowWord = rows[idx].word.trim();
    if (!rowWord) return;
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, aiLoading: true } : r));
    try {
      const result = await getWordFill(rowWord, wordLang);
      setRows((prev) => prev.map((r, i) => {
        if (i !== idx) return r;
        return {
          ...r,
          translateEn: r.translateEn.trim() || result.translateEn,
          translateCh: r.translateCh.trim() || result.translateCh,
          sentence: r.sentence.trim() || result.sentence,
          aiLoading: false,
        };
      }));
    } catch {
      setRows((prev) => prev.map((r, i) => i === idx ? { ...r, aiLoading: false } : r));
    }
  };

  const handleBulkAiFillAll = async () => {
    const unfilled = rows.map((r, i) => ({ idx: i, word: r.word.trim() })).filter(({ idx, word }) => word && !rows[idx].translateEn.trim());
    if (unfilled.length === 0) return;
    setBulkAiAllLoading(true);
    setBulkError('');
    try {
      await Promise.all(unfilled.map(({ idx }) => handleBulkAiFillRow(idx)));
    } catch {
      setBulkError(t('llm.error'));
    } finally {
      setBulkAiAllLoading(false);
    }
  };

  const handleBulkSave = async () => {
    const valid = rows.filter((r) => r.word.trim() && r.translateEn.trim());
    if (valid.length === 0) { setBulkError(t('userVocab.bulkNoValidRows', 'Please fill in at least one word and meaning.')); return; }
    setBulkSaving(true);
    setBulkError('');
    try {
      await onBatchSave!(valid.map((r) => ({
        word: r.word.trim(),
        translateEn: r.translateEn.trim(),
        translateCh: r.translateCh.trim(),
        sentence: r.sentence.trim(),
        phonetics: '',
      })));
      onClose();
    } catch (e: any) {
      const msg = e?.message === 'WORD_LIMIT_EXCEEDED' ? t('userVocab.wordLimitReached') : (e?.message || 'Error');
      setBulkError(msg);
    } finally {
      setBulkSaving(false);
    }
  };

  const validBulkCount = rows.filter((r) => r.word.trim() && r.translateEn.trim()).length;
  const anyBulkRowAiLoading = rows.some((r) => r.aiLoading);
  const unfilledWords = rows.filter((r) => r.word.trim() && !r.translateEn.trim()).length;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 shrink-0">
              {initial?.word
                ? t('userVocab.editWord', 'Edit Word')
                : bulkMode
                  ? t('userVocab.addMultipleWords', 'Add Multiple Words')
                  : t('userVocab.addWord')}
            </h2>
            <div className="flex items-center gap-2">
              {/* System search (single mode only) */}
              {!bulkMode && systemWords && systemWords.length > 0 && (
                <button
                  onClick={() => setShowSystemSearch((v) => !v)}
                  className="text-xs text-blue-500 font-medium hover:text-blue-700 transition-colors whitespace-nowrap"
                >
                  {t('userVocab.fillSystem')}
                </button>
              )}
              {/* Mode toggle (add mode only) */}
              {canBulk && (
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setBulkMode(false)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      !bulkMode
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {t('userVocab.singleMode', 'Single')}
                  </button>
                  <button
                    onClick={() => setBulkMode(true)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      bulkMode
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {t('userVocab.bulkMode', 'Bulk')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Single mode ─────────────────────────────────────────────────── */}
        {!bulkMode && (
          <>
            {showSystemSearch && (
              <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 animate-slide-down">
                <input
                  autoFocus
                  type="text"
                  value={systemQuery}
                  onChange={(e) => setSystemQuery(e.target.value)}
                  placeholder={t('userVocab.searchSystem', 'Search system words...')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {filteredSystem.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {filteredSystem.map((sw) => (
                      <button
                        key={sw.id}
                        onClick={() => fillFromSystem(sw)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{sw.word || sw.sentence}</p>
                        {sw.translateEn && <p className="text-xs text-blue-500 truncate">{sw.translateEn}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {systemQuery && filteredSystem.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">No matches</p>
                )}
              </div>
            )}

            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                  {t('userVocab.word')}
                </label>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder={t('userVocab.word')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {language === 'JA' && (
                  <div className="mt-1.5 flex items-start gap-1.5 px-1">
                    <svg className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                      {t('userVocab.jpKanjiHint')}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                  {t('userVocab.meaningEn')}
                </label>
                <input
                  type="text"
                  value={translateEn}
                  onChange={(e) => setTranslateEn(e.target.value)}
                  placeholder={t('userVocab.meaningEn')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                  {t('userVocab.meaningCh')}
                </label>
                <input
                  type="text"
                  value={translateCh}
                  onChange={(e) => setTranslateCh(e.target.value)}
                  placeholder={t('userVocab.meaningCh')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                  {t('userVocab.sentence')}
                </label>
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder={t('userVocab.sentence')}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                onClick={handleAiFill}
                disabled={aiLoading || !word.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading ? (
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                )}
                {aiLoading ? t('llm.thinking') : t('userVocab.fillAI')}
              </button>

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={handleSave}
                disabled={!word.trim() || !translateEn.trim() || saving}
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors mb-2"
              >
                {saving ? '…' : t('social.save')}
              </button>
              <button
                onClick={onClose}
                className="w-full text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors"
              >
                {t('social.cancel')}
              </button>
            </div>
          </>
        )}

        {/* ── Bulk mode ───────────────────────────────────────────────────── */}
        {bulkMode && (
          <>
            {/* Rows */}
            <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-2 pb-2">
              {rows.map((row, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-2.5 space-y-1.5">
                  {/* Row header: index + AI btn + remove btn */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">#{idx + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleBulkAiFillRow(idx)}
                        disabled={!row.word.trim() || row.aiLoading}
                        title={t('userVocab.fillAI')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {row.aiLoading ? (
                          <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                        )}
                        {t('userVocab.fillAI')}
                      </button>
                      <button
                        onClick={() => removeRow(idx)}
                        title="Remove row"
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Mandatory: word + meaning EN side by side */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={row.word}
                      onChange={(e) => updateRow(idx, 'word', e.target.value)}
                      placeholder={t('userVocab.word').replace(' *', '') + ' *'}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={row.translateEn}
                      onChange={(e) => updateRow(idx, 'translateEn', e.target.value)}
                      placeholder={t('userVocab.meaningEn').replace(' *', '') + ' *'}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Optional: meaning ZH + sentence side by side */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={row.translateCh}
                      onChange={(e) => updateRow(idx, 'translateCh', e.target.value)}
                      placeholder={t('userVocab.meaningCh')}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={row.sentence}
                      onChange={(e) => updateRow(idx, 'sentence', e.target.value)}
                      placeholder={t('userVocab.sentence')}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}

              {/* Add row button */}
              <button
                onClick={addRow}
                className="mt-1 flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium py-1 px-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                {t('userVocab.addRow', 'Add Row')}
              </button>
            </div>

            {/* Footer */}
            <div className="px-4 pb-6 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              {/* AI Fill All */}
              <button
                onClick={handleBulkAiFillAll}
                disabled={bulkAiAllLoading || anyBulkRowAiLoading || unfilledWords === 0}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {bulkAiAllLoading || anyBulkRowAiLoading ? (
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                )}
                {bulkAiAllLoading || anyBulkRowAiLoading
                  ? t('llm.thinking')
                  : t('userVocab.fillAllAI', '✨ AI Fill All')}
                {unfilledWords > 0 && !bulkAiAllLoading && !anyBulkRowAiLoading && (
                  <span className="ml-1 text-xs opacity-70">({unfilledWords})</span>
                )}
              </button>

              {bulkError && <p className="text-xs text-red-500 text-center">{bulkError}</p>}

              <button
                onClick={handleBulkSave}
                disabled={validBulkCount === 0 || bulkSaving || anyBulkRowAiLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {bulkSaving
                  ? '…'
                  : validBulkCount > 0
                    ? t('userVocab.addWordsCount', 'Add {{count}} Words', { count: validBulkCount })
                    : t('userVocab.addWord')}
              </button>
              <button
                onClick={onClose}
                className="w-full text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors"
              >
                {t('social.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default UserVocabWordFormModal;
