import { NgModule } from '@angular/core';
import { HwReviewQuizRecordPage } from './quiz-record/hw-review-quiz-record.page';

import { SharedModule } from 'src/app/shared/modules/shared.module';
import { HwReviewRoutingModule } from './hw-review-routing.module';
import { HwReviewQuizRecordDetailPage } from './quiz-record-detail/hw-review-quiz-record-detail.page';

@NgModule({
  imports: [
    SharedModule,
    HwReviewRoutingModule
  ],
  declarations: [
    HwReviewQuizRecordPage,
    HwReviewQuizRecordDetailPage
  ]
})
export class HwReviewModule {}
