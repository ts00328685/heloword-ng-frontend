import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HwHomeDashboardPage } from './dashboard/hw-home-dashboard.page';
import { HwHomeRoutingModule } from './hw-home-routing.module';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HwHomeRoutingModule
  ],
  declarations: [
    HwHomeDashboardPage
  ]
})
export class HwHomeModule {}
