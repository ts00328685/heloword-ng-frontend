import { Component, Input } from '@angular/core';
import { BaseComponent } from 'src/app/shared/base/base.component';

@Component({
  selector: 'hw-modal-word-setting',
  templateUrl: './modal-word-setting.component.html',
  styleUrls: ['./modal-word-setting.component.scss'],
})
export class ModalWordSettingComponent extends BaseComponent {

  isDisplay = true;
  minValue = 1;
  maxValue = 2;

  @Input()
  max: number = 0;

  settingList: Array<QuizSetting> = [];
  
  quizSettings = {};

  init() {

    const wordStore = super.getDataService().wordStore.getValue();
    const sentenceStore = super.getDataService().sentenceStore.getValue();
    Object.keys(wordStore).forEach(key => {

      const wordList = wordStore[key];
      if (!wordList || wordList.length < 1) return;

      this.settingList.push({
        type: key,
        total: wordList.length
      });

    })

    // TODO refactor
    Object.keys(sentenceStore).forEach(key => {

      const sentenceList = sentenceStore[key];
      if (!sentenceList || sentenceList.length < 1) return;

      this.settingList.push({
        type: key,
        total: sentenceList.length
      });

    })

  }

  onSpellingClick() {
    super.getActionService().nextPageByUrl('/hw-vocabulary/quiz', { quizSettings: this.quizSettings });
    super.getPopoverController().dismiss();
  }

  quizSettingChange(quizSetting: QuizSetting) {
    this.quizSettings[quizSetting.type] = quizSetting;
    super.debug('quiz settings', this.quizSettings);
  }
}

export interface QuizSetting {
  min?: number;
  max?: number;
  type: string;
  total: number;
}