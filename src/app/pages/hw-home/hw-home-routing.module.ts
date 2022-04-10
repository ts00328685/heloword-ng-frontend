import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwHome000Page } from './hw-home000/hw-home000.page';


const routes: Routes = [
  {
    path: '',
    component: HwHome000Page
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class Hw000HomeRoutingModule {}
