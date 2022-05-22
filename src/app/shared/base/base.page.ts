import { Subscription } from 'rxjs';
import { BaseComponent } from 'src/app/shared/base/base.component';
import { Forms } from 'src/app/shared/base/validation/forms';
import { ActivatedRoute } from '@angular/router';
import { InjectorUtils } from '../utils/injector-utils';
import { Injectable } from '@angular/core';

@Injectable()
export abstract class BasePage<T> extends BaseComponent {

    private pData: any;

    private subscription = new Subscription();

    pageHeader = this.getPageName();

    abstract init(): void;

    abstract getFormClazz(): Forms<any>;

    abstract getPageName(): string;

    protected pageInit(): void {
        this.subscribeParams();
        this.checkAndScrollToPageTop();
        this.checkAndStopPageTimer();
        this.getTitleService().setTitle(this.getPageName());
        super.debug('pageData', this.getPageData());
    }

    ngAfterViewInit(): void {
        this.afterViewInit();
    }

    /**
     * for Override
     */
    protected afterViewInit():void{
        
    }

    protected checkAndScrollToPageTop() {
        if (!this.isNeedScrollTop()) { return; }

        super.getViewService().scrollToTop();
    }

    protected isNeedScrollTop(): boolean {
        return true;
    }

    protected checkAndStopPageTimer() {
        if (!this.isNeedCancelPageTimer()) { return; }

        super.getTimerUtils().cancelPageTimer();
    }

    protected isNeedCancelPageTimer(): boolean {
        return true;
    }

    private subscribeParams() {
        this.subscription.add(this.getActionService().routeParamStore$.subscribe(params => {
            super.debug('pageInit routeParamStore', params);
            this.pData = { ...this.pData, ...params };
        }));
    }

    protected destroy(): void {
        if (this.getFormClazz()) {
            this.getFormClazz().unsubscribe();
        }
        this.subscription.unsubscribe();
    }

    protected getPageData(): T {
        return this.pData;
    }

    protected getClassName(): string {
        return this.getPageName() + ' ' + super.getClassName();
    }

    protected handleRsError(rsError) {
        super.error(rsError);
        super.getViewService().showSystemErrorToast();
    }

    protected getActivatedRoute(): ActivatedRoute {
        return InjectorUtils.getInjector().get(ActivatedRoute);
    }

}
