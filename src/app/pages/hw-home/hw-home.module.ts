import { NgModule } from '@angular/core';
import { HwHomeDashboardPage } from './dashboard/hw-home-dashboard.page';
import { HwHomeRoutingModule } from './hw-home-routing.module';
import { SharedModule } from 'src/app/shared/modules/shared.module';

@NgModule({
  imports: [
    SharedModule,
    HwHomeRoutingModule
  ],
  declarations: [
    HwHomeDashboardPage
  ]
})
export class HwHomeModule {}
