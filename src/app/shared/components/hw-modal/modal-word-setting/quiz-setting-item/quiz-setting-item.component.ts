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

  validateInput(type: 'minValue' | 'maxValue', ionChange: CustomEvent | any) {
    const value = +ionChange.detail.value;
    super.debug('validateInput', type, value);
    switch(type) {
      case 'minValue':
        if (value < 1) {
          // settimeout for triggering change detection
          setTimeout(()=>{
            this.minValue = 1;
          })
        }
        if (value >= this.setting.total) {
          this.minValue = this.setting.total;
        }
        break;
      case 'maxValue':
        if (value < this.minValue) {
          this.maxValue = this.minValue + 1;
        }
        if (value >= this.setting.total) {
          this.maxValue = this.setting.total;
        }
        break;
      default:
    }
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
