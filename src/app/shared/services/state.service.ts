import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StateService {

  private readonly settingState = new BehaviorSubject<SettingState>({  });
  private settingState$ = this.settingState.asObservable();

  constructor() {
    this.updateSettingState({} as any);
  }

  updateSettingState(state: SettingState) {
    this.settingState.next(state);
  }

  clearSettingState() {
    this.updateSettingState({ hasEnabledFido: false, custId: '', appID: '' });
  }

  getSettingState() {
    return this.settingState$;
  }

}
export interface SettingState {
}