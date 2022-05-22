import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwInfoGeneralPage } from './general/hw-info-general.page';


const routes: Routes = [
  {
    path: 'general',
    component: HwInfoGeneralPage
  },
  {
    path: '**',
    redirectTo: 'general'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwInfoRoutingModule {}
