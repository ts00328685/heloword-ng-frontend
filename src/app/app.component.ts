import { Component } from '@angular/core';
import { environment } from 'src/environments/environment';
import { BaseComponent } from './shared/base/base.component';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent extends BaseComponent {
  
  version = environment.appVersion;
  
  public appPages = [
    { title: 'Home', url: 'hw-home', icon: 'log-in-outline' },
    { title: 'Vocabulary', url: 'hw-vocabulary', icon: 'log-in-outline' },
    { title: 'Review', url: 'hw-review', icon: 'log-in-outline' },
    { title: 'Stats', url: 'hw-stats', icon: 'log-in-outline' },
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
