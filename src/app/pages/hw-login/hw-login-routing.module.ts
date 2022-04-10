import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwLogin000Page } from './hw-login000/hw-login000.page';


const routes: Routes = [
  {
    path: '',
    component: HwLogin000Page
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HWLoginRoutingModule {}
