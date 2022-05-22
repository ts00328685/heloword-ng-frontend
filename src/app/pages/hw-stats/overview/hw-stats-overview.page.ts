import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';


@Component({
  selector: 'hw-stats-overview',
  templateUrl: './hw-stats-overview.page.html',
  styleUrls: ['./hw-stats-overview.page.scss'],
})
export class HwStatsOverviewPage extends BasePage<any> {

  emptyMsg = super.getAuthService().isUserLoggedIn() ? 'Empty Records~' : 'Log-in required'
  hasAnyRecord = false;
  
  init(): void {
    
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Statistics';
  }

}
