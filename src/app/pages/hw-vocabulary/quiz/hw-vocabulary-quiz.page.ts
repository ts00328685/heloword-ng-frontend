import { Component, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { map, filter, debounceTime, distinctUntilChanged, tap, takeUntil } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { Sentence } from 'src/app/shared/models/common-models';

@Component({
  selector: 'hw-vocabulary-quiz',
  templateUrl: './hw-vocabulary-quiz.page.html',
  styleUrls: ['./hw-vocabulary-quiz.page.scss'],
})
export class HwVocabularyQuizPage extends BasePage<any> {

  wordStore$ = super.getDataService().wordStore.dataStore$;
  sentenceStore$ = super.getDataService().sentenceStore.dataStore$;

  originalWordList: Array<Sentence>;
  currentWord: Sentence;
  totalLength: number;
  currentIndex: number;
  inputValue = '';
  autoPronounce = false;
  autoPronounceEn = false;
  autoPronounceCh = false;
  autoPronounceSentence = false;

  @ViewChild('input')
  input;

  unsubscribe = new Subject();


  init(): void {
    if (!super.getPageData().quizSettings) {
      super.getActionService().goBackHome();
      return;
    }
    this.retrieveData();
  }

  protected afterViewInit(): void {
    this.input.ionChange
      .pipe(
        map((i: any) => i.detail.value),
        filter(value => !!value),
        debounceTime(100),
        distinctUntilChanged(),
        tap(this.onInputChange.bind(this)),
        takeUntil(this.unsubscribe)
      ).subscribe();
    this.input.el.focus();
  }

  retrieveData() {
    const ds = super.getDataService();
    if (!ds.wordStore.isEmpty() || !ds.sentenceStore.isEmpty()) {
      this.initWordList();
      return;
    }

    super.getApiService().doGet('/frontend-api/api/fe/home/dashboard').subscribe(
      response => {
        const wordEnglishList = response.data.wordEnglishList || [];
        const wordGermanList = response.data.wordGermanList || [];
        const wordJapaneseList = response.data.wordJapaneseList || [];
        const sentenceEnglishList = response.data.sentenceEnglishList || [];
        const sentenceGermanList = response.data.sentenceGermanList || [];
        const sentenceJapaneseList = response.data.sentenceJapaneseList || [];
        super.getDataService().wordStore.updateValue(
          {
            wordEnglishList,
            wordGermanList,
            wordJapaneseList
          }
        )
        super.getDataService().sentenceStore.updateValue(
          {
            sentenceEnglishList,
            sentenceGermanList,
            sentenceJapaneseList
          }
        )

        this.initWordList();
      }
    );
  }

  initWordList() {

    const quizSettings = super.getPageData().quizSettings;
    const words = super.getDataService().wordStore.getValue();
    const sentences = super.getDataService().sentenceStore.getValue();
    const wordAndSentences = {
      ...words, ...sentences
    };

    let combinedList = [];

    Object.keys(quizSettings).forEach(key => {
      if (!wordAndSentences[key]) return;
      const setting = quizSettings[key];
      combinedList = [ ...combinedList, ...wordAndSentences[key].slice(setting.min, setting.max) ]
    })
    
    super.debug('combined list', combinedList);

    this.originalWordList = combinedList.sort(() => Math.random() - 0.5);
    if (!this.originalWordList || this.originalWordList.length <= 0) {
      window.location.href = '/';
    }
    this.currentWord = this.originalWordList[0];
    this.totalLength = this.originalWordList.length;
    this.currentIndex = 1;
  }

  onInputChange(word: string) {
    let answer = this.currentWord.word || this.currentWord.sentence.trim().toLowerCase();
    const lastCharacter = answer.charAt(answer.length - 1);
    const charsToIgnore = ['.', '?', '。', '!'];
    if (charsToIgnore.includes(lastCharacter)) {
      answer = answer.substr(0, answer.length - 1);
    }

    const trimmedAns = answer.replace(/[\W]/g, '');
    const trimmedWord = word.trim().toLowerCase().replace(/[\W]/g, '');

    if (word.includes('＊')) {
      return;
    }

    if (trimmedWord.length >= trimmedAns.length && trimmedWord.includes(trimmedAns)) {
      this.goNext();
    }
  }

  onChClick() {
    this.goNext();
  }

  onAnsClick(answer: string) {
    this.input.value = `${answer}＊`;
    this.input.setFocus();
  }

  goNext() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentIndex++;
    this.originalWordList = this.originalWordList.slice(1, this.originalWordList.length);
    this.totalLength = this.originalWordList.length;
    this.currentWord = this.originalWordList[0];
    this.input.value = '';
    if (this.autoPronounce) {
      this.pronounce(this.currentWord.word || this.currentWord.sentence);
    }

    const delay = this.autoPronounce ? 1000 : 0;
    if (this.autoPronounceEn) {
      setTimeout(() => {
        this.pronounce(this.currentWord.translateEn);
      }, delay);
    }
    if (this.autoPronounceCh) {
      setTimeout(() => {
        this.pronounce(this.currentWord.translateCh);
      }, delay);
    }
    if (this.autoPronounceSentence) {
      setTimeout(() => {
        this.pronounce(this.currentWord.sentence);
      }, delay);
    }
    this.input.setFocus();
  }

  pronounce(word: string, type = '') {

    if (!word) {
      return;
    }

    let lang = 'en-US';

    const REGEX_CHINESE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
    if (word.match(REGEX_CHINESE)) {
      lang = 'zh-TW';
    }

    if (word.match(/[\u3040-\u30ff]/)) {
      lang = 'ja-JP';
    }

    word = word.replace(/(\[.*?\]|\(.*?\)) */g, '').replace(/(\<.*?\>) */g, '');

    if ('speechSynthesis' in window) {

      const synthesis = window.speechSynthesis;

      // Get the first `en` language voice in the list
      const voice = synthesis.getVoices().find(aVoice => aVoice.lang === lang);

      // Create an utterance object
      const utterance = new SpeechSynthesisUtterance(word);

      // Set utterance properties
      utterance.voice = voice;
      utterance.pitch = 1.2;
      utterance.rate = 1.00;
      utterance.volume = 1.6;

      // Speak the utterance
      synthesis.speak(utterance);

    } else {
      console.log('Text-to-speech not supported.');
    }

    this.input.setFocus();
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Vocabulary Quiz';
  }

  protected destroy(): void {
    this.unsubscribe.next();
    this.unsubscribe.complete();
  }
}
