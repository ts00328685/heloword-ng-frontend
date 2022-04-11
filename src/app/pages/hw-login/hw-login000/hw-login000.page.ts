import { Component } from '@angular/core';
import { GoogleLoginProvider } from 'angularx-social-login';
import { tap, mergeMap, map } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { RuleUtils } from 'src/app/shared/utils/rules-utils';

@Component({
  selector: 'hw-login000',
  templateUrl: './hw-login000.page.html',
  styleUrls: ['./hw-login000.page.scss'],
})
export class HwLogin000Page extends BasePage<any> {

  loginType = 0;

  userVerifications: Array<string>;

  pwd = '';
  email = '';

  socialUser;
  isLoggedin = false;


  init(): void {
    super.getSocialAuthService().authState
    .pipe(
      tap(socialUser => localStorage.setItem('idToken', socialUser['idToken'])),
      mergeMap(socialUser => super.getApiService().doPost('/service-auth/api/auth/verify-google-id', socialUser, false)),
      map(rs => rs.data || {})
    )
    .subscribe((user) => {
      this.socialUser = user;
      this.isLoggedin = user != null;
      this.handleLoginSuccess(this.socialUser);
      super.debug(this.socialUser);
    });
  }

  getFormClazz(): Forms<any> {
    return null
  }
  
  getPageName(): string {
    return 'Login Page';
  }

  ionViewWillEnter() {
   /*  this.stateService.getSettingState().pipe(
      tap((state) => {
        this.state = state;
        this.hasEnabledFido = state.hasEnabledFido;
        this.currentLoginType = state.hasEnabledFido ? 1 : 0;
        this.custId = state.custId;
        this.maskCustId = state.custId;
      }),
      filter(state => state.hasEnabledFido),
      mergeMap(state => this.apiService.doPost('uaf/requestReg', { username: state.custId })),
      map(requestRegRs => JSON.stringify(requestRegRs['body']['regRequests'])),
      mergeMap((mappedRequestRegRs: string) => this.fidoService.getSupportedAuthenticator(mappedRequestRegRs))
    ).subscribe(
      success => {
        this.userVerifications = success.userVerifications;
        if (this.userVerifications.length == 0) {
          this.stateService.updateSettingState({ hasEnabledFido: false, custId: this.state.custId, appID: '' });
        }
      },
      err => {
        this.stateService.updateSettingState({ hasEnabledFido: false, custId: this.state.custId, appID: '' });
        console.error('doDereg err', err);
        this.viewService.showSystemErrorToast();
      }
    ); */
  }

  switchLoginType(e: any) {
    this.loginType = +this.loginType;
    console.log(e)
  }

  isPwdValid() {
    return this.pwd;
  }

  login() {
  }

  handleLoginSuccess(user) {
    if (RuleUtils.getInstance().isEmptyObject(user)) {
      super.getViewService().showSystemErrorToast();
    } else {
      super.getActionService().nextPageByUrl('/hw-home', { replaceUrl: true }); 
    }
  }

  googleLogin(): void {
    super.getSocialAuthService().signIn(GoogleLoginProvider.PROVIDER_ID);
  }

  logOut(): void {
    super.getSocialAuthService().signOut();
  }
}
