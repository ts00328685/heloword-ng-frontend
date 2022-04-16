import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';




const routes: Routes = [
  {
    path: '',
    redirectTo: 'qe-001',
    pathMatch: 'full'
  },
  {
    path: 'qe-001',
    loadChildren: () => import('./qe001/hw-home-qe001.module').then( m => m.HwHomeQe001Module)
  },
  {
    path: '**',
    redirectTo: 'qe-001'
  }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwHomeRoutingModule {}
