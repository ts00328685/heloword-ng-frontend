import { Component, ViewChild } from '@angular/core';
import { IonInput } from '@ionic/angular';
import { Subject } from 'rxjs';
import { map, filter, debounceTime, distinctUntilChanged, tap, takeUntil } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { QuizSetting } from 'src/app/shared/components/hw-modal/modal-word-setting/modal-word-setting.component';
import { Sentence } from 'src/app/shared/models/common-models';
import { RuleUtils } from 'src/app/shared/utils/rules-utils';

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
  autoInputFocus = true;
  autoComplete = false;
  enableSentenceMask = false;
  failWhenMaskOff = false;
  sentenceMaskIndex = 1;

  pronounciationSpeed = 1.0;
  pronounciationVolume = 0.2;

  settingIdMap: Map<string, number>;

  eachQuestionStartTime = new Date();
  pronounceCount = 0;
  deleteCount = 0;
  wrongCount = 0;

  @ViewChild('input')
  input: IonInput;

  unsubscribe = new Subject();

  init(): void {
    this.initialize();
  }

  ionViewWillEnter() {
    super.getViewService().showAlert('Note that if you type the wrong answer or reveal the asnwer in any way, this word will show up again later for a retest!')
    this.saveQuizSettings(super.getPageData().quizSettings);
    this.initialize();
  }

  initialize() {
    const quizSettings = super.getPageData().quizSettings;
    if (!quizSettings) {
      super.getActionService().goBackHome();
      return;
    }

    const settingList = Object.keys(quizSettings).map(_key => { return { _key, ...quizSettings[_key] }; });
    const alreadyPersisted = settingList.some(setting => !!setting.id);

    if (alreadyPersisted) {
      this.settingIdMap = new Map();
      settingList.forEach((s, index) => {
        this.settingIdMap.set(s.tableName, s.id);
      });
      super.debug('settings already persisted');
    }
    this.initWordList();
  }

  saveQuizSettings(quizSettings: QuizSetting) {

    if (RuleUtils.getInstance().isEmptyObject(quizSettings)) {
      return;
    }

    if (!super.getAuthService().isUserLoggedIn()) {
      return;
    }

    const settingList = Object.keys(quizSettings).map(_key => { return { _key, ...quizSettings[_key] }; });

    const alreadyPersisted = settingList.some(setting => !!setting.id);

    if (alreadyPersisted) {
      return;
    }

    super.getApiService().doPost(
      '/frontend-api/api/fe/quiz/save-setting-records',
      settingList
    ).subscribe(rs => {

      this.settingIdMap = new Map();
      settingList.forEach((s, index) => {
        this.settingIdMap.set(s.tableName, rs.data.ids[index]);
      });

      super.debug('settingIdMap', this.settingIdMap);
    });

  }

  saveSingleRecord() {
    if (!super.getAuthService().isUserLoggedIn()) {
      return;
    }

    if (this.currentWord.recordSaved) {
      return;
    }

    this.currentWord.recordSaved = true;

    const currentTime = new Date();
    const timeSpent = (currentTime.getTime() - this.eachQuestionStartTime.getTime()) / 1000;
    super.getApiService().doPost(
      '/frontend-api/api/fe/quiz/save-single-record',
      {
        answerId: this.currentWord.id,
        answerTableName: this.currentWord.tableName,
        timeSpent,
        quizIndex: this.currentIndex,
        startTime: this.eachQuestionStartTime,
        finishedTime: new Date(),
        pronounceCount: this.pronounceCount,
        deleteCount: this.deleteCount,
        wrongCount: this.wrongCount,
        recordQuizSettingId: this.settingIdMap.get(this.currentWord.tableName),
      }, 
      undefined,
      false
    ).subscribe();

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
    const finishedIdMap: {[key: number]: number[]} = super.getPageData().finishedIdMap;
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
      combinedList = [...combinedList, ...wordAndSentences[key].slice(setting.min - 1, setting.max)]
    })

    super.debug('combined list', combinedList);

    this.originalWordList = combinedList.sort(() => Math.random() - 0.5);
    if (!this.originalWordList || this.originalWordList.length <= 0) {
      super.getActionService().goBackHome();
    }

    // remove finished ones
    if (!RuleUtils.getInstance().isEmptyObject(finishedIdMap)) {
      this.originalWordList = this.originalWordList.filter(word => {
        const settingIdOfThisWord = this.settingIdMap.get(word.tableName);
        return !finishedIdMap[settingIdOfThisWord].includes(word.id);
      });
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

    const isInputWordComplete = trimmedWord.length >= trimmedAns.length;

    if (isInputWordComplete && trimmedWord.includes(trimmedAns)) {
      return true;
    } else if (trimmedWord.length > trimmedAns.length && !trimmedWord.includes(trimmedAns)) {
      this.wrongCount++;
    }

    return false;
  }

  onAnsClick(answer: string) {
    this.wrongCount += 5;
    super.getViewService().showToast(`Correct Answer: ${answer}`, 5000, 'bottom');
    this.input.setFocus();
  }

  onBackspace(word: string) {
    super.debug('backspace pressed');
    this.deleteCount++;
  }

  onEnter(word: string) {
    this.wrongCount += 5;
    super.getViewService().showToast(`Correct Answer: ${this.currentWord.word}`, 5000, 'bottom');
  }

  cancelPronouncing() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  goNext() {
    this.cancelPronouncing();

    let needToReEnterAgain = false;

    if (this.failWhenMaskOff && !this.enableSentenceMask) {
      this.wrongCount++;
    }

    if (this.pronounceCount >= 3) {
      this.wrongCount++;
    }
    
    if (this.wrongCount === 0) {
      this.saveSingleRecord();
    } else {
      needToReEnterAgain = true;
      super.getViewService().showToast('Pushed to the end for retesting again!', 1000);
    }

    this.eachQuestionStartTime = new Date();
    this.pronounceCount = 0;
    this.wrongCount = 0;
    this.deleteCount = 0;
    
    if (!needToReEnterAgain) {
      this.currentIndex++;
    }

    // TODO: go to a result reviewing page
    if (this.currentIndex > this.totalLength) {
      super.getViewService().showToast('Finished!');
      super.getActionService().goBackHome();
      return;
    }

    this.originalWordList = this.originalWordList.slice(1, this.originalWordList.length);

    if (needToReEnterAgain) {
      this.originalWordList.push({...this.currentWord});
    }

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

  toggleSentenceMask() {
    this.enableSentenceMask = !this.enableSentenceMask;
    if (!this.enableSentenceMask) {
      this.wrongCount++;
    }
  }

  pronounce(word: string, type = '') {

    this.cancelPronouncing();

    this.pronounceCount++;

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

    if (this.autoInputFocus) {
      this.input.setFocus();
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

class QuizRecord {
  username: string;
  answerId: number;
  answerTableName: string;
  timeSpent: number;
  startTime: Date;
  finishedTime: Date;
  pronounceCount: number;
  deleteCount: number;
  wrongCount: number;
}
