import { KeyValue } from '@angular/common';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { QuizSetting } from 'src/app/shared/components/hw-modal/modal-word-setting/modal-word-setting.component';
import { UtilsService } from 'src/app/shared/services/utils.service';
@Component({
  selector: 'hw-review-quiz-record-detail',
  templateUrl: './hw-review-quiz-record-detail.page.html',
  styleUrls: ['./hw-review-quiz-record-detail.page.scss'],
})
export class HwReviewQuizRecordDetailPage extends BasePage<any> {

  titleMap = UtilsService.getWordSentenceTitleMap();
  settingRecords$: Observable<Map<Date, { records: Array<QuizSetting>, completed: number, total: number }>>;
  hasAnyRecord = true;

  emptyMsg = super.getAuthService().isUserLoggedIn() ? 'Empty Records~' : 'Log-in required'

  init(): void {
    if (!super.getAuthService().isUserLoggedIn()) {
      return;
    }

    const pageData = super.getPageData();
    super.debug(pageData);

    this.settingRecords$ = this.retrieveData();
  }

  unsorted = (a: KeyValue<Date, { records: Array<QuizSetting>, completed: number, total: number }>, b: KeyValue<Date, { records: Array<QuizSetting>, completed: number, total: number }>): number => {
    return new Date(b.key).getTime() - new Date(a.key).getTime();
  }

  retrieveData() {
    return super.getApiService().doPost('/frontend-api/api/fe/quiz/get-quiz-settings').pipe(
      map(response => response.data)
    )
  }
  
  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Review Detail';
  }

}
