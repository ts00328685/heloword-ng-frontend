import React, { createContext, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import FuriganaText from '../../components/FuriganaText';
import TapToLookup from '../../components/TapToLookup';
import { Eyebrow } from '../../components/ui';
import { Segmented } from '../../components/ui/practice';
import { pronounceWord } from '../../services/tts.service';
import { Block, Example, GrammarLang, GrammarTopic } from './grammarContent';
import { GRAMMAR } from './grammarRegistry';
import { grammarLangFrom } from './grammarPath';

const LangContext = createContext<GrammarLang>('en');

/** Renders **bold** spans and 漢字[かな] readings. */
const Rich: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
      part.startsWith('**')
        ? <strong key={i} className="font-semibold text-ink"><FuriganaText text={part.slice(2, -2)} /></strong>
        : <FuriganaText key={i} text={part} />,
    )}
  </>
);

const sentenceText = (ex: Example) =>
  (ex.text ?? (ex.segs || []).filter(s => !s.del).map(s => s.t).join(' ')).replace(/\*\*/g, '');

const Speaker: React.FC<{ text: string }> = ({ text }) => {
  const lang = useContext(LangContext);
  return (
    <button
      data-analytics="grammar.pronounce"
      onClick={() => pronounceWord(text, lang === 'ja' ? 'jp' : 'en')}
      className="shrink-0 p-1 -m-1 text-ink-faint hover:text-ink transition-colors"
      aria-label="Pronounce"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    </button>
  );
};

const ExampleRow: React.FC<{ ex: Example }> = ({ ex }) => {
  const lang = useContext(LangContext);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {ex.arrow && <span className="text-accent text-[15px] leading-6 shrink-0">→</span>}
          <TapToLookup lang={lang} className="block">
            {ex.segs ? (
              <span className="flex flex-wrap items-end gap-x-2.5 gap-y-1.5">
                {ex.segs.map((s, i) => (
                  <span key={i} className="inline-flex flex-col">
                    <span className={`text-[15px] leading-7 ${s.del ? 'line-through text-ink-faint' : 'text-ink border-b border-ink/25'}`}><FuriganaText text={s.t} /></span>
                    {s.role && <span className="mt-0.5 text-[10px] text-ink-faint">{s.role}</span>}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[15px] leading-7 text-ink"><Rich text={ex.text || ''} /></span>
            )}
          </TapToLookup>
        </div>
        {(ex.zh || ex.tag) && (
          <p className={`mt-1 text-xs leading-relaxed ${ex.arrow ? 'pl-5' : ''}`}>
            {ex.zh && <span className="text-ink-muted"><Rich text={ex.zh} /></span>}
            {ex.tag && <span className="text-ink-faint">{ex.zh ? '　' : ''}（{ex.tag}）</span>}
          </p>
        )}
      </div>
      <Speaker text={sentenceText(ex)} />
    </div>
  );
};

const BlockView: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.kind) {
    case 'p':
      return <p className="text-sm text-ink-muted leading-7"><Rich text={block.text} /></p>;
    case 'h':
      return <h3 className={`pt-2 text-sm font-semibold ${block.warn ? 'text-danger' : 'text-ink'}`}><Rich text={block.text} /></h3>;
    case 'rule':
      return (
        <div className="border-l-2 border-accent bg-accent-soft/60 rounded-r-md px-4 py-3">
          {block.title && <p className="text-xs text-ink-muted mb-1.5">{block.title}</p>}
          {block.lines.map((l, i) => <p key={i} className="text-[15px] leading-7 text-ink"><Rich text={l} /></p>)}
        </div>
      );
    case 'examples':
      return (
        <div>
          {block.label && <Eyebrow className="mb-1.5">{block.label}</Eyebrow>}
          <div className="bg-surface border border-line rounded-md divide-y divide-line">
            {block.items.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
          </div>
        </div>
      );
    case 'transform':
      return (
        <div className="bg-surface border border-line rounded-md divide-y divide-line">
          {block.items.map((it, i) => (
            <div key={i} className="px-4 py-2.5 text-sm leading-6">
              <span className="text-ink-muted">{it.from}</span>
              <span className="ml-1.5 text-[10px] text-ink-faint">{it.fromTag}</span>
              <span className="mx-2 text-accent">→</span>
              <span className="text-ink">{it.to}</span>
              <span className="ml-1.5 text-[10px] text-ink-faint">{it.toTag}</span>
            </div>
          ))}
        </div>
      );
    case 'table': {
      // Tables with sentence-length cells stack per row on phones
      const stacked = !!block.stack;
      return (
        <div>
          {block.caption && <Eyebrow className="mb-1.5">{block.caption}</Eyebrow>}
          {stacked && (
            <div className="sm:hidden bg-surface border border-line rounded-md divide-y divide-line">
              {block.rows.map((r, i) => (
                <div key={i} className="px-4 py-3">
                  <p className="text-sm font-medium text-ink leading-7"><Rich text={r[0]} /></p>
                  <dl className="mt-1 space-y-1">
                    {r.slice(1).map((c, j) => c && (
                      <div key={j} className="flex gap-3">
                        <dt className="w-16 shrink-0 text-[11px] text-ink-faint leading-7"><Rich text={block.head[j + 1]} /></dt>
                        <dd className="flex-1 min-w-0 text-[15px] text-ink leading-7"><Rich text={c} /></dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
          <div className={`overflow-x-auto border border-line rounded-md ${stacked ? 'hidden sm:block' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-paper">
                <tr>{block.head.map((h, i) => <th key={i} className="px-3 py-2 text-left text-[11px] font-medium text-ink-faint whitespace-nowrap"><Rich text={h} /></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={`px-3 py-2 leading-7 align-top ${j === 0 ? 'text-ink-muted whitespace-nowrap' : 'text-ink'}`}><Rich text={c} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case 'note':
      return (
        <div className="flex gap-2 text-xs text-ink-muted leading-relaxed bg-paper border border-line rounded-md px-3 py-2.5">
          <span className="shrink-0 font-semibold text-ink">註</span>
          <div className="space-y-1">
            {block.text.split('\n').map((l, i) => <p key={i} className="leading-6"><Rich text={l} /></p>)}
            {block.examples?.map(e => <p key={e} className="text-ink">{e}</p>)}
          </div>
        </div>
      );
  }
};

const TopicSection: React.FC<{ topic: GrammarTopic; index: number }> = ({ topic, index }) => (
  <section id={topic.id} className="scroll-mt-20 pt-10 first:pt-2">
    <Eyebrow>{String(index + 1).padStart(2, '0')}</Eyebrow>
    <h2 className="font-serif text-[22px] leading-snug text-ink mt-1 mb-4">{topic.title}</h2>
    <div className="space-y-4">
      {topic.blocks.map((b, i) => <BlockView key={i} block={b} />)}
    </div>
  </section>
);

/**
 * 快速文法 — the parts of an English or Japanese sentence, one scrollable page per
 * language. Example sentences can be read aloud and their words tapped for lookup.
 * `?lang=ja` picks the tab, `#topic-id` jumps to a topic.
 */
const GrammarPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search, hash } = useLocation();
  const lang = grammarLangFrom(search);
  const { heading, topics } = GRAMMAR[lang];

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [hash, lang]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const switchLang = (l: GrammarLang) => navigate({ search: l === 'ja' ? '?lang=ja' : '' }, { replace: true });

  return (
    <LangContext.Provider value={lang}>
      <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
        <Header title={t('grammar.title')} showBack />

        <main className="flex-1 pb-24 px-5 pt-6 max-w-2xl mx-auto w-full">
          <Segmented
            value={lang}
            onChange={switchLang}
            options={[{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]}
          />
          <h1 className="font-serif text-[26px] leading-snug text-ink mt-6">{heading}</h1>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">{t(lang === 'ja' ? 'grammar.subtitleJa' : 'grammar.subtitle')}</p>

          <nav className="mt-6 border-y border-line divide-y divide-line">
            {topics.map((topic, i) => (
              <button
                key={topic.id}
                data-analytics={`grammar.toc.${topic.id}`}
                onClick={() => jump(topic.id)}
                className="w-full flex items-baseline gap-3 py-2.5 text-left group"
              >
                <span className="w-5 shrink-0 text-[11px] font-mono text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm text-ink group-hover:underline underline-offset-4">{topic.title}</span>
                <span className="ml-auto pl-2 text-[11px] text-ink-faint truncate"><Rich text={topic.summary} /></span>
              </button>
            ))}
          </nav>

          {topics.map((topic, i) => <TopicSection key={topic.id} topic={topic} index={i} />)}

          {lang === 'en' && <p className="mt-10 text-xs text-ink-faint text-right">{t('grammar.toBeContinued')}</p>}
        </main>
      </div>
    </LangContext.Provider>
  );
};

export default GrammarPage;
