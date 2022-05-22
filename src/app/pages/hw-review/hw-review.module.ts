import { NgModule } from '@angular/core';
import { HwReviewQuizRecordPage } from './quiz-record/hw-review-quiz-record.page';

import { SharedModule } from 'src/app/shared/modules/shared.module';
import { HwReviewRoutingModule } from './hw-review-routing.module';

@NgModule({
  imports: [
    SharedModule,
    HwReviewRoutingModule
  ],
  declarations: [
    HwReviewQuizRecordPage
  ]
})
export class HwReviewModule {}
