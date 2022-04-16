import { Component, OnInit } from '@angular/core';
import { mergeMap } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'hw-home-dashboard',
  templateUrl: './hw-home-dashboard.page.html',
  styleUrls: ['./hw-home-dashboard.page.scss'],
})
export class HwHomeDashboardPage extends BasePage<any> {
  
  init(): void {

    if (environment.cipher.aesIv && environment.cipher.aesKey) {
      return;
    }

    super.getApiService().doGet('/service-auth/api/auth/init-cookie').pipe(
      mergeMap(() =>  super.getApiService().doGet('/service-auth/api/auth/init-cipher'))
    ).subscribe(response => {
      super.debug('init cipher', response);
      environment.cipher = response.data;
    })
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Home 000';
  }

  test() {
    super.getApiService().doGet('/service-word/api/word-english/example/according to').subscribe(super.debug.bind(this));
  }


}
