import { NgModule } from '@angular/core';
import { HwStatsOverviewPage } from './overview/hw-stats-overview.page';

import { SharedModule } from 'src/app/shared/modules/shared.module';
import { HwStatsRoutingModule } from './hw-stats-routing.module';

@NgModule({
  imports: [
    SharedModule,
    HwStatsRoutingModule
  ],
  declarations: [
    HwStatsOverviewPage
  ]
})
export class HwStatsModule {}
