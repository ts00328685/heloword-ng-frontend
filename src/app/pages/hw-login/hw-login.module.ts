import { NgModule } from '@angular/core';
import { HWLoginRoutingModule } from './hw-login-routing.module';
import { HwLoginNormalPage } from './normal/hw-login-normal.page';
import { SharedModule } from 'src/app/shared/modules/shared.module';

@NgModule({
  imports: [
    SharedModule,
    HWLoginRoutingModule
  ],
  declarations: [
    HwLoginNormalPage
  ]
})
export class HwLoginModule {}
