import React, { createContext, useCallback, useContext, useState } from 'react';
import { Sentence, SentenceStore, WordStore } from '../models';

interface DataContextType {
  wordStore: WordStore;
  sentenceStore: SentenceStore;
  updateWordStore: (store: WordStore) => void;
  updateSentenceStore: (store: SentenceStore) => void;
  clearAllStore: () => void;
  isWordStoreEmpty: () => boolean;
  isSentenceStoreEmpty: () => boolean;
}

const EMPTY_WORD_STORE: WordStore = {
  wordEnglishList: [],
  wordGermanList: [],
  wordJapaneseList: [],
};

const EMPTY_SENTENCE_STORE: SentenceStore = {
  sentenceEnglishList: [],
  sentenceGermanList: [],
  sentenceJapaneseList: [],
};

const DataContext = createContext<DataContextType>({} as DataContextType);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wordStore, setWordStore] = useState<WordStore>(EMPTY_WORD_STORE);
  const [sentenceStore, setSentenceStore] = useState<SentenceStore>(EMPTY_SENTENCE_STORE);

  const updateWordStore = useCallback((store: WordStore) => setWordStore(store), []);
  const updateSentenceStore = useCallback((store: SentenceStore) => setSentenceStore(store), []);

  const clearAllStore = useCallback(() => {
    setWordStore(EMPTY_WORD_STORE);
    setSentenceStore(EMPTY_SENTENCE_STORE);
  }, []);

  const isWordStoreEmpty = useCallback(
    () =>
      !wordStore.wordEnglishList?.length &&
      !wordStore.wordGermanList?.length &&
      !wordStore.wordJapaneseList?.length,
    [wordStore]
  );

  const isSentenceStoreEmpty = useCallback(
    () =>
      !sentenceStore.sentenceEnglishList?.length &&
      !sentenceStore.sentenceGermanList?.length &&
      !sentenceStore.sentenceJapaneseList?.length,
    [sentenceStore]
  );

  return (
    <DataContext.Provider
      value={{
        wordStore,
        sentenceStore,
        updateWordStore,
        updateSentenceStore,
        clearAllStore,
        isWordStoreEmpty,
        isSentenceStoreEmpty,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => useContext(DataContext);
