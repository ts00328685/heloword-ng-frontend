import { environment } from 'src/environments/environment';

import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateChild, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { BaseComponent } from '../base/base.component';

@Injectable({
    providedIn: 'root'
})
export class PageActivateGuard extends BaseComponent implements CanActivateChild {

    canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot)
        : boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {

        const currentRouteParams = {
            ...super.getActionService().getCurrentRouteParam(),
            ...childRoute.params,
            ...childRoute.queryParams,
        };
        super.debug('canActivateChild triggered');
        super.debug('stateSnapshot ', state);
        super.debug('routeSnapshot ', childRoute);
        super.debug('route params', currentRouteParams)
        super.getActionService().updateRouteParam(currentRouteParams);

        if (environment.cipher.aesIv && environment.cipher.aesKey && super.getAuthService().hasCheckedUserLoginStatus()) {
            return true;
        }

        return super.getApiService().doGet('/service-auth/api/auth/init-cookie')
            .pipe(
                mergeMap(() => super.getApiService().doGet('/service-auth/api/auth/init-cipher')),
                tap(response => environment.cipher = response.data),
                mergeMap(() => super.getApiService().doGet('/frontend-api/api/fe/user')),
                map(response => {
                    super.getAuthService().hasCheckedUserLoginStatus(true);
                    if (response.code !== '0000') {
                        return true;
                    }
                    if (response.data && response.data.user) {
                        super.getAuthService().updateUserStore(response.data.user);
                        super.debug('user session found, automatically logging in');
                    }
                    return true;
                })
            );
    }

}
