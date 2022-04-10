import { environment } from 'src/environments/environment';

import { LoggerUtils } from '../utils/logger-utils';
import { ActionService } from '../services/action.service';
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateChild, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ApiService } from '../services/api.service';
import { ViewService } from '../services/view.service';

@Injectable({
    providedIn: 'root'
})
export class PageActivateGuard implements CanActivateChild {

    logger = LoggerUtils;


    constructor(private actionService: ActionService, private apiService: ApiService, private viewService: ViewService) { }

    canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot)
        : boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
        this.logger.debug('canActivateChild triggered');
        this.logger.debug('stateSnapshot ', state);
        this.logger.debug('routeSnapshot ', childRoute);

        // TODO
        const pageUrl = state.url.substr(0, 10);
        const isUrlCustomSet = '';
        const isUrlRequireInvoke = isUrlCustomSet && isUrlCustomSet[0];
        const customParams = (isUrlRequireInvoke && isUrlCustomSet[1]) ? isUrlCustomSet[1] : {};
        const currentRouteParams = {
            ...customParams,
            ...this.actionService.getCurrentRouteParam(),
            ...childRoute.params,
            ...childRoute.queryParams,
        };
        if (currentRouteParams.invoke == null || currentRouteParams.invoke) {
            return this.getPageData(pageUrl, currentRouteParams)
                .pipe(
                    tap(data => {
                        currentRouteParams.invoke = null;
                        /* 目前後端帶回的參數會蓋過自傳的參數 */
                        this.actionService.updateRouteParam({ ...currentRouteParams, ...data } || {});
                        // this.viewService.hideLoader();
                    }),
                    map(rsData => true)
                );
        } else {
            currentRouteParams.invoke = null;
            this.actionService.updateRouteParam(currentRouteParams);
            return true;
        }

    }

    getPageData(url: string, params = {}): Observable<any> {
        // this.viewService.showLoader();
        return new Observable<any>((observer => {
            this.apiService.doPost(url, params,
                // rsData => observer.next(rsData)
            );
        }));
    }

}
