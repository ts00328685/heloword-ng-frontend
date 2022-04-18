import { Component } from '@angular/core';
import { GoogleLoginProvider } from 'angularx-social-login';
import { mergeMap, map } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { User } from 'src/app/shared/services/auth.service';
import { RuleUtils } from 'src/app/shared/utils/rules-utils';

@Component({
  selector: 'hw-login-normal',
  templateUrl: './hw-login-normal.page.html',
  styleUrls: ['./hw-login-normal.page.scss'],
})
export class HwLoginNormalPage extends BasePage<any> {

  loginType = 0;

  pwd = '';
  email = '';

  isLoggedin = false;

  init(): void {
    super.getSocialAuthService().authState
    .pipe(
      mergeMap(socialUser => super.getApiService().doPost('/service-auth/api/auth/verify-google-id', socialUser)),
      map(rs => rs.data || {})
    )
    .subscribe((user: User) => {
      this.handleLoginSuccess(user);
    });
  }

  getFormClazz(): Forms<any> {
    return null
  }
  
  getPageName(): string {
    return 'Login Page';
  }

  ionViewWillEnter() {
  
  }

  switchLoginType(e: any) {
    this.loginType = +this.loginType;
    super.debug(e)
  }

  isPwdValid() {
    return this.pwd;
  }

  handleLoginSuccess(user: User) {
    if (RuleUtils.getInstance().isEmptyObject(user)) {
      super.getViewService().showSystemErrorToast();
    } else {
      super.getAuthService().updateUserStore(user);
      super.getActionService().nextPageByUrl('/hw-home', { replaceUrl: true }); 
    }
  }

  googleLogin(): void {
    super.getSocialAuthService().signIn(GoogleLoginProvider.PROVIDER_ID);
  }

}
