import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FuriganaText from '../../components/FuriganaText';
import FuriganaToggle from '../../components/FuriganaToggle';
import Header from '../../components/Header';
import { fetchNHKArticleById, NHKArticleDetail, NHKParagraph } from '../../services/nhkArticle.service';
import { LangKey, ParagraphCard, useArticleSpeech, useWordLookup, vocabTap } from './ArticleShared';
import WordLookupSheet from '../../components/WordLookupSheet';
import { SwitchRow } from '../../components/ui/practice';
import { RecallSummary, recallTargetsByParagraph, useArticleRecall } from './ArticleRecall';
import { trackContentView } from '../../services/analytics.service';

function buildParagraphsFromContent(article: NHKArticleDetail): NHKParagraph[] {
  const jaParas = article.contentJa?.split('\n\n').filter(Boolean) ?? [];
  const enParas = article.contentEn?.split('\n\n').filter(Boolean) ?? [];
  const zhParas = article.contentZh?.split('\n\n').filter(Boolean) ?? [];
  const grammarBlocks = article.contentGrammar?.split('\n\n').filter(Boolean) ?? [];
  if (jaParas.length === 0) return [];
  const allVocab = article.contentVocabulary ?? [];
  const n = jaParas.length;
  return jaParas.map((ja, i) => ({
    original: ja,
    ja,
    en: enParas[i] ?? '',
    zh: zhParas[i] ?? '',
    grammar: grammarBlocks[i] ?? '',
    vocabulary: allVocab.slice(
      Math.floor((i * allVocab.length) / n),
      Math.floor(((i + 1) * allVocab.length) / n),
    ),
  }));
}

const LANG_TABS: { key: LangKey; label: string }[] = [
  { key: 'original', label: '原文' },
  { key: 'zh', label: '繁中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日文' },
];

const NHKArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [article, setArticle] = useState<NHKArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeLang, setActiveLang] = useState<LangKey>('zh');

  useEffect(() => {
    if (!id) return;
    fetchNHKArticleById(id)
      .then((data) => {
        if (!data) setError(true);
        else {
          setArticle(data);
          trackContentView('nhk_article', data.title);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const paragraphs = useMemo(() => {
    const stored = (article?.paragraphs ?? []).filter(Boolean);
    if (stored.length > 0) return stored;
    if (article) return buildParagraphsFromContent(article);
    return [];
  }, [article]);

  const lookup = useWordLookup();
  const recall = useArticleRecall(`${'nhk'}:${id}`);
  const recallTargets = useMemo(() => recallTargetsByParagraph(paragraphs, 'ja'), [paragraphs]);
  const { speakingKey, speakingMode, spokenRange, triggerSpeak } = useArticleSpeech({ paragraphs, activeLang });

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nhk.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="space-y-4 mt-2">
            <div className="h-7 bg-ink/5 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-ink/5 rounded animate-pulse w-1/3" />
            <div className="flex gap-2 mt-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 w-16 bg-ink/5 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="space-y-3 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-ink/5 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-ink-faint text-sm">{t('nhk.loadError')}</p>
            <button
              onClick={() => navigate('/nhk-articles')}
              className="mt-4 text-sm text-accent hover:text-accent"
            >
              {t('nhk.backToList')}
            </button>
          </div>
        )}

        {article && (
          <>
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-ink leading-snug mb-2">
                <FuriganaText text={article.title} />
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <span>日文原文</span>
                <span>·</span>
                <span>{new Date(article.createDate).toLocaleDateString('zh-TW')}</span>
                {article.sourceUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 hover:text-accent transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {t('nhk.source')}
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs text-ink-faint">{t('common.furigana')}</span>
              <FuriganaToggle />
            </div>

            <div className="flex gap-1.5 mb-4 p-1 bg-ink/5 rounded-xl">
              {LANG_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveLang(key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeLang === key
                      ? 'bg-surface text-accent shadow-sm'
                      : 'text-ink-muted hover:text-ink '
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {paragraphs.length > 0 && (
              <div className="mb-3">
                <SwitchRow
                  label={t('articleRecall.toggle')}
                  sub={t('articleRecall.toggleSub')}
                  checked={recall.on}
                  onChange={recall.toggle}
                />
                <p className="text-xs text-ink-faint mt-2">{recall.on ? t('articleRecall.hint') : t('wordLookup.tapHint')}</p>
              </div>
            )}
            <div className="space-y-3 mb-5">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <ParagraphCard
                    key={i}
                    paragraph={p}
                    activeLang={activeLang}
                    index={i}
                    speakingKey={speakingKey}
                    speakingMode={speakingMode}
                    spokenRange={spokenRange}
                    onSpeak={triggerSpeak}
                    lookupLang="ja"
                    selectedWord={lookup.tap?.index === i ? lookup.tap.word : null}
                    onWordTap={(word) => lookup.setTap({ index: i, word })}
                    recall={recall.on ? { targets: recallTargets[i] ?? [], marks: recall.marks, onMark: recall.setMark } : null}
                  />
                ))
              ) : (
                <p className="text-sm text-ink-faint text-center py-8">
                  {t('nhk.noParagraphs')}
                </p>
              )}
            </div>
            {recall.on && (
              <RecallSummary
                targets={recallTargets}
                marks={recall.marks}
                onWordTap={(i, item) => lookup.setTap({ index: i, word: vocabTap(paragraphs[i], item, 'ja') })}
                onReset={recall.reset}
              />
            )}
          </>
        )}
      </main>
      {lookup.tap && <WordLookupSheet tapped={lookup.tap.word} lang="ja" onClose={lookup.close} />}
    </div>
  );
};

export default NHKArticleDetailPage;
