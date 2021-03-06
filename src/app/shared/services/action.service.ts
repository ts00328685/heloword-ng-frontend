import { BehaviorSubject } from 'rxjs';
import { BaseService } from '../base/base.service';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class ActionService extends BaseService {

  private routeParamStore = new BehaviorSubject({});
  public readonly routeParamStore$ = this.routeParamStore.asObservable();

  constructor(private router: Router) {
    super();
    window['actionService'] = this;
  }

  public nextPageByUrl(url: string, params = {}, newWindow = false) {
    this.routeParamStore.next(params);
    if (newWindow) {
      super.debug('nextPageByUrl url:', url);
      this.router.navigate([]).then(result => { window.open('/' + url, '_blank'); });
    } else {
      this.router.navigate([url]);
    }

  }

  public reloadApp() {
    window.location.href = '/';
  }

  public reloadPage(params = {}) {
    const prevUrl = this.getCurrentUrl();
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.nextPageByUrl(prevUrl, params));
  }

  public redirectTo(url: string, params = {}) {
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.nextPageByUrl(url, params));
  }

  public goBackHome() {
    this.router.navigateByUrl('/hw-home');
  }

  public getCurrentUrl(): string {
    return this.router.url;
  }

  public getCurrentRouteParam(): any {
    return this.routeParamStore.getValue();
  }

  public updateRouteParam(params = {}) {
    this.routeParamStore.next({ ...this.routeParamStore.getValue(), ...params });
  }

}
