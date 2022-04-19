import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwVocabularyListPage } from './list/hw-vocabulary-list.page';
import { HwVocabularyQuizPage } from './quiz/hw-vocabulary-quiz.page';


const routes: Routes = [
  {
    path: 'list',
    component: HwVocabularyListPage
  },
  {
    path: 'quiz',
    component: HwVocabularyQuizPage
  },
  {
    path: '**',
    redirectTo: 'list'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwVocabularyRoutingModule {}
