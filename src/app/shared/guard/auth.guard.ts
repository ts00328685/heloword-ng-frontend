import { environment } from 'src/environments/environment';
import { LoggerUtils } from './../utils/logger-utils';
import { ActionService } from './../services/action.service';
import { AuthService } from '../services/auth.service';
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard implements CanActivate {

    logger = LoggerUtils;

    constructor(private actionService: ActionService, private authService: AuthService) { }

    /**
     * @Override
     */
    canActivate(routeSnapshot: ActivatedRouteSnapshot, stateSnapshot: RouterStateSnapshot): boolean {

        this.logger.debug('stateSnapshot url', stateSnapshot.url);
        this.logger.debug('queryParamMap url', routeSnapshot.queryParamMap);

        const isLogin = this.authService.isUserLoggedIn();

        // not logged in
        if (!isLogin) {
            // redirect to home
            // this.actionService.nextPageByUrl(environment.loginPath, {}, false);
            return false;
        }

        /* logged in but having no authority */
        if (isLogin && !this.isUrlAuthorized(stateSnapshot.url.substr(0, 10), this.authService.getUserAuthorities())) {
            this.actionService.nextPageByUrl('');
            return false;
        }

        return isLogin;
    }

    isUrlAuthorized(url: string, authorities: string[]): boolean {
        if (url.indexOf('/') > -1) {
            url = url.split('/').map(s => s.trim().toLowerCase()).join('');
        }
        return authorities.indexOf(url) > -1;
    }
}
