import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BaseComponent } from '../../base/base.component';

@Component({
  selector: 'hw-bottom-tabs',
  templateUrl: './hw-bottom-tabs.component.html',
  styleUrls: ['./hw-bottom-tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HwBottomTabsComponent extends BaseComponent {

  @Input()
  selected: 'hw-vocabulary' 
          | 'hw-review'
          | 'hw-home'
          | 'hw-stats'
          | 'hw-info';
}
