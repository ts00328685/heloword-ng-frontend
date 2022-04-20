import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseComponent } from 'src/app/shared/base/base.component';
import { QuizSetting } from '../modal-word-setting.component';

@Component({
  selector: 'hw-quiz-setting-item',
  templateUrl: './quiz-setting-item.component.html'
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

  init() {

  }

  assignValue(key: string, value: string) {
    this[key] = +value;
    this.settingChange.emit({
      min: this.minValue,
      max: this.maxValue,
      type: this.setting.type,
      total: this.setting.total
    })
  }
}
