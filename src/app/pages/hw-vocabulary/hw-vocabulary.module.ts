import { NgModule } from '@angular/core';
import { HwVocabularyQuizPage } from './quiz/hw-vocabulary-quiz.page';
import { HwVocabularyRoutingModule } from './hw-vocabulary-routing.module';
import { SharedModule } from 'src/app/shared/modules/shared.module';
import { HwVocabularyListPage } from './list/hw-vocabulary-list.page';

@NgModule({
  imports: [
    SharedModule,
    HwVocabularyRoutingModule
  ],
  declarations: [
    HwVocabularyQuizPage,
    HwVocabularyListPage
  ]
})
export class HwVocabularyModule {}
