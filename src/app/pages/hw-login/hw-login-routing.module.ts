import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwLoginNormalPage } from './normal/hw-login-normal.page';



const routes: Routes = [
  {
    path: 'normal',
    component: HwLoginNormalPage
  },
  {
    path: '**',
    redirectTo: 'normal'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HWLoginRoutingModule {}
