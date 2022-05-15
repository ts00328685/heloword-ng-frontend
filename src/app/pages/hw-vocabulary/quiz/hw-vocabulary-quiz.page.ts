import { Component, ViewChild } from '@angular/core';
import { IonInput } from '@ionic/angular';
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
  // TODO: extract these settings to localstorage
  autoPronounce = false;
  autoPronounceEn = false;
  autoPronounceCh = false;
  autoPronounceSentence = false;
  autoInputFocus = false;
  autoComplete = false;

  pronounciationSpeed = 1.0;
  pronounciationVolume = 0.2;
  

  @ViewChild('input')
  input: IonInput;

  unsubscribe = new Subject();


  init(): void {
    this.initialize();
  }

  ionViewWillEnter() {
    this.initialize();
  }

  initialize() {
    if (!super.getPageData().quizSettings) {
      super.getActionService().goBackHome();
      return;
    }
    this.initWordList();
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
    
    if (this.autoInputFocus) {
      this.input.setFocus();
    }
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
      combinedList = [ ...combinedList, ...wordAndSentences[key].slice(setting.min - 1, setting.max) ]
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
    if (this.isAnswerCorrect(word)) {
      this.goNext();
    }
  }

  getRawAnswer() {
    let answer = (this.currentWord.word || this.currentWord.sentence);

    if (this.currentWord.language === 'jp') {
      answer = this.currentWord.translateEn
    }

    return answer.trim().toLowerCase();
  }

  isAnswerCorrect(word: string): boolean {

    let answer = this.getRawAnswer();

    if (this.currentWord.language === 'de') {
      answer = answer.replace(/[ä]/g, 'a');
      answer = answer.replace(/[ö]/g, 'o');
      answer = answer.replace(/[ü]/g, 'u');
      answer = answer.replace(/[ß]/g, 'b');
    }

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
      return true;
    }

    return false;
  }

  onChClick() {
    this.goNext();
  }

  onAnsClick(answer: string) {
    this.input.value = `${answer}＊`;
    this.input.setFocus();
  }

  onEnter(word: string) {
    if (!this.isAnswerCorrect(word)) {
      super.getViewService().showToast('Wrong answer!', 1000);
    }
    this.goNext();
  }

  cancelPronouncing() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  goNext() {
    this.cancelPronouncing();

    this.currentIndex++;

    // TODO: go to a result reviewing page
    if (this.currentIndex > this.totalLength) {
      super.getViewService().showToast('Finished!');
      super.getActionService().goBackHome();
      return;
    }

    this.originalWordList = this.originalWordList.slice(1, this.originalWordList.length);
    this.currentWord = this.originalWordList[0];
    this.input.value = '';
    if (this.autoPronounce) {
      this.pronounce(this.currentWord.word || this.currentWord.sentence, this.currentWord.language);
    }

    const delay = this.autoPronounce ? 1000 : 0;
    if (this.autoPronounceEn) {
      setTimeout(() => {
        this.pronounce(this.currentWord.translateEn, 'en');
      }, delay);
    }
    if (this.autoPronounceCh) {
      setTimeout(() => {
        this.pronounce(this.currentWord.translateCh, 'ch');
      }, delay);
    }
    if (this.autoPronounceSentence) {
      setTimeout(() => {
        this.pronounce(this.currentWord.sentence, this.currentWord.language);
      }, delay);
    }

    this.input.getInputElement().then(e => {
      e.blur();
      if (this.autoInputFocus) {
        this.input.setFocus();
      }
    });
  }

  pronounce(word: string, type = '') {

    this.cancelPronouncing();
    
    if (!word) {
      return;
    }

    let lang = 'en-US';

    if (type === 'ch') {
      lang = 'zh-TW';
    }

    if (type === 'jp') {
      lang = 'ja-JP';
    }

    if (type === 'de') {
      lang = 'de-DE';
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
      utterance.rate = this.pronounciationSpeed;
      utterance.volume = this.pronounciationVolume;

      // Speak the utterance
      synthesis.speak(utterance);

    } else {
      super.error('Text-to-speech not supported.');
    }

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
