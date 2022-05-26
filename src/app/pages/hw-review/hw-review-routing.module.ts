import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HwReviewQuizRecordDetailPage } from './quiz-record-detail/hw-review-quiz-record-detail.page';
import { HwReviewQuizRecordPage } from './quiz-record/hw-review-quiz-record.page';


const routes: Routes = [
  {
    path: 'quiz-record',
    component: HwReviewQuizRecordPage
  },  
  {
    path: 'quiz-record-detail',
    component: HwReviewQuizRecordDetailPage
  },
  {
    path: '**',
    redirectTo: 'quiz-record'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HwReviewRoutingModule {}
