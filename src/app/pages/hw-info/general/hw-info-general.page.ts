import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';


@Component({
  selector: 'hw-info-general',
  templateUrl: './hw-info-general.page.html',
  styleUrls: ['./hw-info-general.page.scss'],
})
export class HwInfoGeneralPage extends BasePage<any> {

  init(): void {
    
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Information';
  }

}
