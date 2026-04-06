import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomWord } from '../services/customVocab.service';
import { getWordInsight } from '../services/llm.service';
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

interface Props {
  initial?: Partial<WordFormData>;
  onClose: () => void;
  onSave: (data: WordFormData) => Promise<void>;
  /** System word list to search from — passed in from the parent page */
  systemWords?: Sentence[];
  /** Language of the parent custom group (e.g. 'JA', 'EN') */
  language?: string;
}

const UserVocabWordFormModal: React.FC<Props> = ({ initial, onClose, onSave, systemWords, language }) => {
  const { t, i18n } = useTranslation();
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

  const handleAiFill = async () => {
    if (!word.trim()) { setError(t('userVocab.wordRequired', 'Word is required to use AI Fill')); return; }
    setAiLoading(true);
    setError('');
    try {
      const result = await getWordInsight(word.trim(), translateEn, translateCh, i18n.language, 'en');
      // Parse AI result: first line as meaning if translateEn is empty
      if (!translateEn.trim() && result) {
        const lines = result.split('\n').filter(Boolean);
        if (lines.length > 0) setTranslateEn(lines[0].replace(/^[*-]\s*/, '').slice(0, 200));
        if (lines.length > 1) setSentence(lines.slice(1).join(' ').slice(0, 500));
      } else {
        setSentence((prev) => prev || result.split('\n').filter(Boolean).slice(1).join(' ').slice(0, 500));
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="px-6 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {initial?.word ? t('userVocab.editWord', 'Edit Word') : t('userVocab.addWord')}
            </h2>
            {systemWords && systemWords.length > 0 && (
              <button
                onClick={() => setShowSystemSearch((v) => !v)}
                className="text-xs text-blue-500 font-medium hover:text-blue-700 transition-colors"
              >
                {t('userVocab.fillSystem')}
              </button>
            )}
          </div>
        </div>

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
      </div>
    </div>
  );
};

export default UserVocabWordFormModal;
