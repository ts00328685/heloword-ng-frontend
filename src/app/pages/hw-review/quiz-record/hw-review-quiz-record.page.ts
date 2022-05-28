import { KeyValue } from '@angular/common';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { QuizSetting } from 'src/app/shared/components/hw-modal/modal-word-setting/modal-word-setting.component';
import { UtilsService } from 'src/app/shared/services/utils.service';
@Component({
  selector: 'hw-review-quiz-record',
  templateUrl: './hw-review-quiz-record.page.html',
  styleUrls: ['./hw-review-quiz-record.page.scss'],
})
export class HwReviewQuizRecordPage extends BasePage<any> {

  titleMap = UtilsService.getWordSentenceTitleMap();
  settingRecords$: Observable<Map<Date, { records: Array<QuizSetting>, completed: number, total: number }>>;
  hasAnyRecord = true;

  emptyMsg = super.getAuthService().isUserLoggedIn() ? 'Empty Records~' : 'Log-in required'

  init(): void {
    if (!super.getAuthService().isUserLoggedIn()) {
      this.hasAnyRecord = false;
      return;
    }
    this.settingRecords$ = this.retrieveData();
  }

  ionViewWillEnter() {
    this.init();
  }

  unsorted = (a: KeyValue<Date, { records: Array<QuizSetting>, completed: number, total: number }>, b: KeyValue<Date, { records: Array<QuizSetting>, completed: number, total: number }>): number => {
    return new Date(b.key).getTime() - new Date(a.key).getTime();
  }

  retrieveData() {
    return super.getApiService().doPost('/frontend-api/api/fe/quiz/get-quiz-settings').pipe(
      map(response => response.data),
      map((data: Map<Date, Array<QuizSetting>>) => {
        const dataExt: Map<Date, { records: Array<QuizSetting>, completed: number, total: number }> = new Map();

        Object.keys(data).forEach((key) => {
          const settings = data[key];
          const { completed, total } = settings.reduce((prev, curr) => {
            const total = curr.max - curr.min + 1 + prev.total;
            const totalFinished = curr.finishedCount + prev.completed;
            return { completed: totalFinished, total: total };
          }, { completed: 0, total: 0 });
          dataExt.set(new Date(key), {
            total,
            completed,
            records: settings
          });
        })
        return dataExt;
      }),
      tap(data => {
        if (data.size <= 0) {
          this.hasAnyRecord = false;
        }
      })
    )
  }

  clickCard(settings: { records: Array<QuizSetting>, completed: number, total: number }) {
    super.debug(settings)

    if (settings.completed === settings.total) {
      return;
    }

    const settingIds = settings.records.map(s => s.id);
    super.getApiService().doPost('/frontend-api/api/fe/quiz/get-record-ids-by-setting-ids', settingIds).subscribe(response => {

      const quizSettings = settings.records.reduce((prev, curr) => {
        curr.timestamp = new Date();
        curr.tableName = this.getTableNameFromType(curr.type);
        return {...prev, [curr.type]: curr};
      }, {} as any);

      const finishedIdMap = response.data;

      super.debug(quizSettings);
      super.getActionService().nextPageByUrl('/hw-vocabulary/quiz', { quizSettings, finishedIdMap });
    });

  }

  getTableNameFromType(type: string) {
    return {
      wordEnglishList: 'word_english',
      wordGermanList: 'word_german',
      wordJapaneseList: 'word_japanese',
      sentenceEnglishList: 'sentence_english',
      sentenceGermanList: 'sentence_german',
      sentenceJapaneseList: 'sentence_japanese',
    }[type];
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Review';
  }

}
