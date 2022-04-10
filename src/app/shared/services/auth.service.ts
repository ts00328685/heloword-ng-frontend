
import { BehaviorSubject } from 'rxjs';
import { BaseService } from '../base/base.service';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { UserVO } from '../models/common-models';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends BaseService {

  private userStore = new BehaviorSubject<UserVO>({ isLoggedIn: false, authorities: [], roles: [], menus: {}, branches: [], name: '', counselorType: [] });
  public readonly userStore$ = this.userStore.asObservable();

  private jwt = '';

  constructor() {
    super();
  }

  updateJwt(jwt: string) {
    this.jwt = jwt;

    let funList = [] as any;
    let name = '';

    const authorities = funList.functions.map((func: any) => func.funId.toLowerCase());
    const menus = {} as any;
    funList.functions.forEach((func: any) => {
      menus[func.funId.toLowerCase()] = {
        name: func.name,
        desc: func.desc
      };
    });

    const counselorType = funList.counselorType;
    const branches = funList.branches;
    const roles = funList.roles;
    this.updateUserStore({ isLoggedIn: true, authorities, roles, menus, branches, name, counselorType });
  }

  getJwt(): string {
    return this.jwt;
  }

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