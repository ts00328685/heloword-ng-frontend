import { NgModule } from '@angular/core';
import { HwInfoGeneralPage } from './general/hw-info-general.page';

import { SharedModule } from 'src/app/shared/modules/shared.module';
import { HwInfoRoutingModule } from './hw-info-routing.module';

@NgModule({
  imports: [
    SharedModule,
    HwInfoRoutingModule
  ],
  declarations: [
    HwInfoGeneralPage
  ]
})
export class HwInfoModule {}
