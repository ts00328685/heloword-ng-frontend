import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GoogleLoginProvider, SocialAuthService } from 'angularx-social-login';
import { tap, mergeMap } from 'rxjs/operators';
import { ApiService } from 'src/app/shared/services/api.service';
import { SettingState, StateService } from 'src/app/shared/services/state.service';
import { ViewService } from 'src/app/shared/services/view.service';

@Component({
  selector: 'hw-login000',
  templateUrl: './hw-login000.page.html',
  styleUrls: ['./hw-login000.page.scss'],
})
export class HwLogin000Page implements OnInit {

  loginType = 0;

  userVerifications: Array<string>;

  pwd = '';
  email = '';

  socialUser;
  isLoggedin = false;

  constructor(
    private stateService: StateService,
    private apiService: ApiService,
    private viewService: ViewService,
    private socialAuthService: SocialAuthService,
    private router: Router) {
  }

  ngOnInit() {
    this.socialAuthService.authState
    .pipe(
      tap(socialUser => localStorage.setItem('idToken', socialUser['idToken'])),
      mergeMap(socialUser => this.apiService.doPost('/service-auth/api/auth/verify-google-id', socialUser, false))
    )
    .subscribe((user) => {
      this.socialUser = user;
      this.isLoggedin = user != null;
      this.handleLoginSuccess();
      console.log(this.socialUser);
    });
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

  test() {
    this.apiService.doGet('/service-word/api/word-english/example/according to').subscribe(console.log);
  }

  login() {
  }

  handleLoginSuccess() {
    // this.state.custId = this.custId;
    // if (this.state.custId != this.custId) {
    //   this.stateService.clearSettingState();
    //   this.stateService.updateSettingState(this.state);
    // }
    this.router.navigateByUrl('/hw-home', { replaceUrl: true });
  }

  googleLogin(): void {
    this.socialAuthService.signIn(GoogleLoginProvider.PROVIDER_ID);
  }

  logOut(): void {
    this.socialAuthService.signOut();
  }
}
