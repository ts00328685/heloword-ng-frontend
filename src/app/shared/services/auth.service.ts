
import { BehaviorSubject } from 'rxjs';
import { BaseService } from '../base/base.service';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { UserVO } from '../models/common-models';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends BaseService {

  private userStore = new BehaviorSubject<any>({ isLoggedIn: false, authorities: [], roles: [], menus: {}, branches: [], name: '', counselorType: [] });
  public readonly userStore$ = this.userStore.asObservable();

  updateUserStore(userVO: UserVO) {
    this.userStore.next(userVO);
    super.debug('updated UserVO:', userVO);
  }

  getUser() {
    return this.userStore.getValue();
  }

  isUserLoggedIn(): boolean {
    return true;
  }

  getUserAuthorities(): string[] {
    return []
  }

  getMenus(): { [key: string]: any } {
    return [];
  }

  getRoles(): string[] {
    return [];
  }

  getBranches(): any[] {
    return [];
  }

  hasAuthority(authorities: string[]): boolean {
    let hasAuthority = false;
    this.getUserAuthorities().forEach(auth => {
      if (authorities.indexOf(auth) > -1) {
        hasAuthority = true;
        return;
      }
    });
    return hasAuthority;
  }

  hasRole(roles: string[]): boolean {
    let hasRole = false;
    this.getRoles().forEach(role => {
      if (roles.indexOf(role) > -1) {
        hasRole = true;
        return;
      }
    });
    return hasRole;
  }
}