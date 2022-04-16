import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwHomeQe0010100Page } from './0100/hw-home-qe001-0100.page';




const routes: Routes = [
  {
    path: '0100',
    component: HwHomeQe0010100Page
  },
  {
    path: '**',
    redirectTo: '0100'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwHomeQe001RoutingModule {}
