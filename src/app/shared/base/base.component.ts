import { AuthService } from '../services/auth.service';
import { TimerUtils } from './../utils/timer-utils';
import { AfterViewInit, ChangeDetectorRef, OnDestroy, OnInit, Renderer2 } from '@angular/core';
import { InjectorUtils } from '../utils/injector-utils';
import { LoggerUtils } from '../utils/logger-utils';
import { RuleUtils } from '../utils/rules-utils';
import { CommonUtils } from '../utils/common-utils';
import { FuSurveyService } from '../components/fu-survey/fu-survey.service';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { ActionService } from '../services/action.service';
import { ViewService } from '../services/view.service';
import { ApiService } from '../services/api.service';

export abstract class BaseComponent implements OnInit, OnDestroy, AfterViewInit {
    
    ngAfterViewInit(): void {
    }

    ngOnInit(): void {
        this.pageInit();
        this.init();
        this.checkAndStopComponentTimer();
        this.debug(this.getClassName() + ' Initialized');
    }

    ngOnDestroy(): void {
        this.destroy();
        this.debug(this.getClassName() + ' Destroyed');
    }

    protected init(): void {

    }

    protected pageInit(): void {

    }

    protected destroy(): void {

    }

    protected checkAndStopComponentTimer() {
        if (!this.isNeedCancelComponentTimer()) { return; }

        this.getTimerUtils().cancelComponentTimer();
    }

    protected isNeedCancelComponentTimer(): boolean {
        return false;
    }

    protected getActionService(): ActionService {
        return InjectorUtils.getInjector().get(ActionService);
    }

    protected getViewService(): ViewService {
        return InjectorUtils.getInjector().get(ViewService);
    }

    protected getAuthService(): AuthService {
        return InjectorUtils.getInjector().get(AuthService);
    }

    protected getApiService(): ApiService {
        return InjectorUtils.getInjector().get(ApiService);
    }

    protected getChangeDetectionRef(): ChangeDetectorRef {
        return InjectorUtils.getInjector().get(ChangeDetectorRef);
    }

    protected getRenderer(): Renderer2 {
        return InjectorUtils.getInjector().get(Renderer2);
    }

    protected getSurveyService(): FuSurveyService {
        return InjectorUtils.getInjector().get(FuSurveyService);
    }

    protected getDomSanitizer(): DomSanitizer {
        return InjectorUtils.getInjector().get(DomSanitizer);
    }

    protected getTitleService(): Title {
        return InjectorUtils.getInjector().get(Title);
    }

    protected getRules(): RuleUtils {
        return RuleUtils.getInstance();
    }

    protected getTimerUtils(): TimerUtils {
        return TimerUtils.getInstance();
    }

    protected getCommonUtils(): CommonUtils {
        return CommonUtils;
    }

    protected getClassName(): string {
        return this.constructor.name;
    }

    protected debug(...logs: any[]): void {
        LoggerUtils.debug(this.getClassName(), ...logs);
    }

    protected info(...logs: any[]): void {
        LoggerUtils.info(this.getClassName(), ...logs);
    }

    protected warn(...logs: any[]): void {
        LoggerUtils.warn(this.getClassName(), ...logs);
    }

    protected error(...logs: any[]): void {
        LoggerUtils.error(this.getClassName(), ...logs);
    }

    protected fatal(...logs: any[]): void {
        LoggerUtils.fatal(this.getClassName(), ...logs);
    }

}
