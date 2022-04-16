import { Component, OnInit } from '@angular/core';
import { mergeMap } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'hw-home-qe001-0100',
  templateUrl: './hw-home-qe001-0100.page.html',
  styleUrls: ['./hw-home-qe001-0100.page.scss'],
})
export class HwHomeQe0010100Page extends BasePage<any> {
  
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
    return 'Home Qu-001 0100 - home dashboard';
  }

  test() {
    super.getApiService().doGet('/service-word/api/word-english/example/according to').subscribe(super.debug.bind(this));
  }


}
