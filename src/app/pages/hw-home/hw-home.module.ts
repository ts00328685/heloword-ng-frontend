import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HwHome000Page } from './hw-home000/hw-home000.page';
import { Hw000HomeRoutingModule } from './hw-home-routing.module';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    Hw000HomeRoutingModule
  ],
  declarations: [
    HwHome000Page
  ]
})
export class HwHomeModule {}
