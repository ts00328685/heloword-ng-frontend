import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { SentenceStore, WordStore } from '../models';
import { doPost } from '../services/api.service';

interface DataContextType {
  wordStore: WordStore;
  previewWordStore: WordStore;
  sentenceStore: SentenceStore;
  isFullyLoaded: boolean;
  updateWordStore: (store: WordStore) => void;
  updatePreviewWordStore: (store: WordStore) => void;
  updateSentenceStore: (store: SentenceStore) => void;
  clearAllStore: () => void;
  isWordStoreEmpty: () => boolean;
  isSentenceStoreEmpty: () => boolean;
  loadFullDashboard: () => Promise<{ words: WordStore; sentences: SentenceStore }>;
}

const EMPTY_WORD_STORE: WordStore = {
  wordEnglishList: [],
  wordGermanList: [],
  wordJapaneseList: [],
  wordJapaneseVerbList: [],
};

const EMPTY_SENTENCE_STORE: SentenceStore = {
  sentenceEnglishList: [],
  sentenceGermanList: [],
  sentenceJapaneseList: [],
};

const DataContext = createContext<DataContextType>({} as DataContextType);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wordStore, setWordStore] = useState<WordStore>(EMPTY_WORD_STORE);
    const [previewWordStore, setPreviewWordStore] = useState<WordStore>({
        wordEnglishList: [],
        wordGermanList: [],
        wordJapaneseList: [],
        wordJapaneseVerbList: []
  });
  const [sentenceStore, setSentenceStore] = useState<SentenceStore>(EMPTY_SENTENCE_STORE);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);

  // Refs mirror state so loadFullDashboard can return current values synchronously
  const wordStoreRef = useRef<WordStore>(EMPTY_WORD_STORE);
  const previewWordStoreRef = useRef<WordStore>(EMPTY_WORD_STORE);
  const sentenceStoreRef = useRef<SentenceStore>(EMPTY_SENTENCE_STORE);
  const fullLoadPromiseRef = useRef<Promise<{ words: WordStore; sentences: SentenceStore }> | null>(null);

  const updateWordStore = useCallback((store: WordStore) => {
    wordStoreRef.current = store;
    setWordStore(store);
  }, []);

  const updatePreviewWordStore = useCallback((store: WordStore) => {
    previewWordStoreRef.current = store;
    setPreviewWordStore(store);
  }, []);

  const updateSentenceStore = useCallback((store: SentenceStore) => {
    sentenceStoreRef.current = store;
    setSentenceStore(store);
  }, []);

  const clearAllStore = useCallback(() => {
    wordStoreRef.current = EMPTY_WORD_STORE;
    sentenceStoreRef.current = EMPTY_SENTENCE_STORE;
    setWordStore(EMPTY_WORD_STORE);
    setSentenceStore(EMPTY_SENTENCE_STORE);
    setIsFullyLoaded(false);
    fullLoadPromiseRef.current = null;
  }, []);

  const isWordStoreEmpty = useCallback(
    () =>
      !wordStore.wordEnglishList?.length &&
      !wordStore.wordGermanList?.length &&
      !wordStore.wordJapaneseList?.length &&
      !wordStore.wordJapaneseVerbList?.length,
    [wordStore]
  );

  const isSentenceStoreEmpty = useCallback(
    () =>
      !sentenceStore.sentenceEnglishList?.length &&
      !sentenceStore.sentenceGermanList?.length &&
      !sentenceStore.sentenceJapaneseList?.length,
    [sentenceStore]
  );

  const loadFullDashboard = useCallback((): Promise<{ words: WordStore; sentences: SentenceStore }> => {
    if (isFullyLoaded) {
      return Promise.resolve({ words: wordStoreRef.current, sentences: sentenceStoreRef.current });
    }
    if (fullLoadPromiseRef.current) return fullLoadPromiseRef.current;

    fullLoadPromiseRef.current = doPost('/frontend-api/api/fe/home/dashboard')
      .then((response: any) => {
        const d = response.data || {};
        const words: WordStore = {
          wordEnglishList: d.wordEnglishList || [],
          wordGermanList: d.wordGermanList || [],
          wordJapaneseList: d.wordJapaneseList || [],
          wordJapaneseVerbList: d.wordJapaneseVerbList || [],
        };
        const sentences: SentenceStore = {
          sentenceEnglishList: d.sentenceEnglishList || [],
          sentenceGermanList: d.sentenceGermanList || [],
          sentenceJapaneseList: d.sentenceJapaneseList || [],
        };
        updateWordStore(words);
        updateSentenceStore(sentences);
        setIsFullyLoaded(true);
        fullLoadPromiseRef.current = null;
        return { words, sentences };
      })
      .catch((e: any) => {
        fullLoadPromiseRef.current = null;
        throw e;
      });

    return fullLoadPromiseRef.current;
  }, [isFullyLoaded, updateWordStore, updateSentenceStore]);

  return (
    <DataContext.Provider
      value={{
        wordStore,
        previewWordStore,
        sentenceStore,
        isFullyLoaded,
        updateWordStore,
        updatePreviewWordStore,
        updateSentenceStore,
        clearAllStore,
        isWordStoreEmpty,
        isSentenceStoreEmpty,
        loadFullDashboard,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => useContext(DataContext);
