import { Component } from '@angular/core';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  public appPages = [
    { title: 'Home', url: 'hw-home', icon: 'log-in-outline' },
    { title: 'Login', url: 'hw-login', icon: 'log-in-outline' },
  ];
}
