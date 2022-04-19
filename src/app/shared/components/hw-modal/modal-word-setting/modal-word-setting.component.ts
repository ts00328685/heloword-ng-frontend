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

  init() {

  }

  onSpellingClick() {
    super.getActionService().nextPageByUrl('/hw-vocabulary/quiz');
    super.getPopoverController().dismiss();
  }

  assignValue(key: string, value: string) {
    this[key] = +value;
  }
}
