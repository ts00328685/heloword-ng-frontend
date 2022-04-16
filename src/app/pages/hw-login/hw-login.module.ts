import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HWLoginRoutingModule } from './hw-login-routing.module';
import { HwLoginNormalPage } from './normal/hw-login-normal.page';




@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HWLoginRoutingModule
  ],
  declarations: [
    HwLoginNormalPage
  ]
})
export class HwLoginModule {}
