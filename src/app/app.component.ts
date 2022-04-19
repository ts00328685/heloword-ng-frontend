import { Component } from '@angular/core';
import { BaseComponent } from './shared/base/base.component';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent extends BaseComponent {
  
  public appPages = [
    { title: 'Home', url: 'hw-home', icon: 'log-in-outline' },
    { title: 'Vocabulary', url: 'hw-vocabulary', icon: 'log-in-outline' },
    { title: 'Login', url: 'hw-login', icon: 'log-in-outline' },
  ];

  user$ = super.getAuthService().userStore$;

  init() {
    super.getApiService().retrieveUserIp();
  }

  logout() {
    super.getAuthService().logout();
  }

}
