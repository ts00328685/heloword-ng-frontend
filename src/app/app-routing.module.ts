import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'hw-home',
    pathMatch: 'full'
  },
  {
    path: 'hw-home',
    loadChildren: () => import('./pages/hw-home/hw-home.module').then( m => m.HwHomeModule)
  },
  {
    path: 'hw-login',
    loadChildren: () => import('./pages/hw-login/hw-login.module').then( m => m.HwLoginModule)
  },
  {
    path: '**',
    redirectTo: 'hw-home'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
