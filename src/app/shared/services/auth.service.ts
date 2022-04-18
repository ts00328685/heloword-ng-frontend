
import { BehaviorSubject } from 'rxjs';
import { BaseService } from '../base/base.service';
import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { RuleUtils } from '../utils/rules-utils';
import { DataService } from './data.service';
import { ActionService } from './action.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends BaseService {

  private userStore = new BehaviorSubject<User>({} as any);
  public readonly userStore$ = this.userStore.asObservable();

  private checkedUserLoginStatus = false;

  constructor(private apiService: ApiService, private dataService: DataService, private actionService: ActionService) {
    super();
  }

  updateUserStore(user: User) {
    this.userStore.next(user);
    if (!RuleUtils.getInstance().isEmptyObject) {
      this.hasCheckedUserLoginStatus(true);
    }
    super.debug('updated user:', user);
    this.dataService.clearAllStore();
  }

  hasCheckedUserLoginStatus(hasChecked = false): boolean {
    if (hasChecked) {
      this.checkedUserLoginStatus = hasChecked;
    }
    return this.checkedUserLoginStatus;
  }

  getUser() {
    return this.userStore.getValue();
  }

  logout() {
    this.apiService.doGet('/service-auth/api/auth/logout').subscribe();
    this.updateUserStore({} as any);
    this.dataService.clearAllStore();
  }

  isUserLoggedIn(): boolean {
    return !!this.userStore.getValue();
  }

  getRoles(): string[] {
    return this.userStore.getValue()?.roles?.map(r=>r.name) || [];
  }

  hasAnyRole(roles: string[] = []): boolean {
    return roles.some(r => this.getRoles().includes(r));
  }

  hasAllRoles(roles: string[] = []): boolean {
    return roles.every(r => this.getRoles().includes(r));
  }
}
export interface Role {
  status: number;
  role: string;
  name: string;
}
export interface User {
  username: string;
  fullname: string;
  nickname: string;
  picture: string;
  locale: string;
  email: string;
  googleToken: string;
  facebookToken: string;
  roles: Role[];
}


