import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BaseComponent } from '../../base/base.component';

@Component({
  selector: 'hw-header',
  templateUrl: './hw-header.component.html',
  styleUrls: ['./hw-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HwHeaderComponent extends BaseComponent {

  @Input()
  pageHeader: string;

}
