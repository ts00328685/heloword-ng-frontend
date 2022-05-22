import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwStatsOverviewPage } from './overview/hw-stats-overview.page';


const routes: Routes = [
  {
    path: 'overview',
    component: HwStatsOverviewPage
  },
  {
    path: '**',
    redirectTo: 'overview'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwStatsRoutingModule {}
