import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwHomeDashboardPage } from './dashboard/hw-home-dashboard.page';


const routes: Routes = [
  {
    path: 'dashboard',
    component: HwHomeDashboardPage
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwHomeRoutingModule {}
