import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HWLoginRoutingModule } from './hw-login-routing.module';
import { HwLogin000Page } from './hw-login000/hw-login000.page';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HWLoginRoutingModule
  ],
  declarations: [
    HwLogin000Page
  ]
})
export class HwLoginModule {}
