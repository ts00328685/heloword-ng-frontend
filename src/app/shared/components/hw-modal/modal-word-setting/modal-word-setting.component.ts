import { Component, Input } from '@angular/core';
import { BaseComponent } from 'src/app/shared/base/base.component';

@Component({
  selector: 'hw-modal-word-setting',
  templateUrl: './modal-word-setting.component.html',
  styleUrls: ['./modal-word-setting.component.scss'],
})
export class ModalWordSettingComponent extends BaseComponent {

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
        total: wordList.length,
        isSelected: false
      });

    })

    // TODO refactor
    Object.keys(sentenceStore).forEach(key => {

      const sentenceList = sentenceStore[key];
      if (!sentenceList || sentenceList.length < 1) return;

      this.settingList.push({
        type: key,
        total: sentenceList.length,
        isSelected: true
      });

    })

  }

  onSpellingClick() {
    const quizSettings = Object.keys(this.quizSettings).reduce((pre, cur) => {
      const setting = this.quizSettings[cur];
      if (!setting.isSelected) {
        return pre;
      }
      return {...pre, [cur]: setting}
    }, {});


    if (super.getRules().isEmptyObject(quizSettings)) {
      super.getViewService().showAlert('Please select at least one group!');
      return;
    }


    super.getActionService().nextPageByUrl('/hw-vocabulary/quiz', { quizSettings });
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
  isSelected: boolean;
}