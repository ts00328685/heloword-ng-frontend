import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { ApiService } from 'src/app/shared/services/api.service';
import { StateService } from 'src/app/shared/services/state.service';
import { ViewService } from 'src/app/shared/services/view.service';

@Component({
  selector: 'hw-home000',
  templateUrl: './hw-home000.page.html',
  styleUrls: ['./hw-home000.page.scss'],
})
export class HwHome000Page  {

  balance = 0;

  showScan = false;

  constructor(
    private navCtrl: NavController,
    private apiService: ApiService,
    private stateService: StateService,
    private viewService: ViewService
  ) { }

  ionViewWillEnter() {

  }

}
