import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { PageActivateGuard } from './shared/guard/page.activate.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'hw-home',
    pathMatch: 'full'
  },
  {
    path: 'hw-home',
    canActivateChild: [PageActivateGuard],
    loadChildren: () => import('./pages/hw-home/hw-home.module').then( m => m.HwHomeModule)
  },
  {
    path: 'hw-login',
    canActivateChild: [PageActivateGuard],
    loadChildren: () => import('./pages/hw-login/hw-login.module').then( m => m.HwLoginModule)
  },
  {
    path: 'hw-vocabulary',
    canActivateChild: [PageActivateGuard],
    loadChildren: () => import('./pages/hw-vocabulary/hw-vocabulary.module').then( m => m.HwVocabularyModule)
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
