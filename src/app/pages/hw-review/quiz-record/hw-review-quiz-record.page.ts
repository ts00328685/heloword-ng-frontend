import { KeyValue } from '@angular/common';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { QuizSetting } from 'src/app/shared/components/hw-modal/modal-word-setting/modal-word-setting.component';
import { UtilsService } from 'src/app/shared/services/utils.service';
import { RuleUtils } from 'src/app/shared/utils/rules-utils';

@Component({
  selector: 'hw-review-quiz-record',
  templateUrl: './hw-review-quiz-record.page.html',
  styleUrls: ['./hw-review-quiz-record.page.scss'],
})
export class HwReviewQuizRecordPage extends BasePage<any> {

  titleMap = UtilsService.getWordSentenceTitleMap();
  settingRecords$: Observable<Map<Date, Array<QuizSetting>>>;
  hasAnyRecord = true;
  
  emptyMsg = super.getAuthService().isUserLoggedIn() ? 'Empty Records~' : 'Log-in required'

  init(): void {
    this.settingRecords$ = this.retrieveData();
  }

  unsorted = (a: KeyValue<Date, Array<QuizSetting>>, b: KeyValue<Date, Array<QuizSetting>>): number => {
    return new Date(b.key).getTime() - new Date(a.key).getTime();
  }

  retrieveData() {
    return super.getApiService().doPost('/frontend-api/api/fe/quiz/get-quiz-settings').pipe(
      map(response => response.data),
      tap(data => {
        if (RuleUtils.getInstance().isEmptyObject(data)) {
          this.hasAnyRecord = false;
        }
      })
    )
  }

  clickCard(list) {
    super.getActionService().nextPageByUrl('/hw-vocabulary/list', { wordListOriginal: list });
  }

  goVocabularyPage() {
    super.getActionService().nextPageByUrl('/hw-vocabulary')
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Review';
  }

}
