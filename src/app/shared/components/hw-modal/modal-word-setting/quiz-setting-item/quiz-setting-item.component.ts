import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseComponent } from 'src/app/shared/base/base.component';
import { UtilsService } from 'src/app/shared/services/utils.service';
import { QuizSetting } from '../modal-word-setting.component';

@Component({
  selector: 'hw-quiz-setting-item',
  templateUrl: './quiz-setting-item.component.html',
  styleUrls: ['./quiz-setting-item.component.scss'],
})
export class QuizSettingItemComponent extends BaseComponent {

  @Input()
  minValue = 1;
  @Input()
  maxValue = 2;

  @Input()
  setting: QuizSetting = {} as QuizSetting;

  @Output()
  settingChange: EventEmitter<QuizSetting> = new EventEmitter();

  titleMap = UtilsService.getWordSentenceTitleMap();

  init() {
    this.emitValue();
  }

  assignValue(key: string, value: string) {
    this[key] = +value;
    this.emitValue();
  }

  emitValue() {
    this.settingChange.emit({
      min: this.minValue,
      max: this.maxValue,
      type: this.setting.type,
      total: this.setting.total,
      isSelected: this.setting.isSelected
    })
  }
}
