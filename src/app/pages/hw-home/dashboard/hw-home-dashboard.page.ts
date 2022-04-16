import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';

@Component({
  selector: 'hw-home-dashboard',
  templateUrl: './hw-home-dashboard.page.html',
  styleUrls: ['./hw-home-dashboard.page.scss'],
})
export class HwHomeDashboardPage extends BasePage<any> {
  
  init(): void {

  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Home Dashboard';
  }

  test() {
    super.getApiService().doGet('/service-word/api/word-english/example/according to').subscribe(super.debug.bind(this));
  }


}
