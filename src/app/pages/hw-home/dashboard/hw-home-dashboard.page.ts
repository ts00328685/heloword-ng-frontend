import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';

@Component({
  selector: 'hw-home-dashboard',
  templateUrl: './hw-home-dashboard.page.html',
  styleUrls: ['./hw-home-dashboard.page.scss'],
})
export class HwHomeDashboardPage extends BasePage<any> {

  wordStore$ = super.getDataService().wordStore.dataStore$;
  sentenceStore$ = super.getDataService().sentenceStore.dataStore$;

  titleMap = {
    wordEnglishList: 'English Words',
    wordGermanList: 'German Words',
    wordJapaneseList: 'Japanese Words',
    sentenceEnglishList: 'English Sentences',
    sentenceGermanList: 'German Sentences',
    sentenceJapaneseList: 'Japanese Sentences',
  }
  
  init(): void {
    this.retrieveData();
  }

  retrieveData() {
    const ds = super.getDataService();
    if (!ds.wordStore.isEmpty() || !ds.sentenceStore.isEmpty()) {
      return;
    }

    super.getApiService().doGet('/frontend-api/api/fe/home/dashboard').subscribe(
      response => {
        const wordEnglishList = response.data.wordEnglishList || [];
        const wordGermanList = response.data.wordGermanList || [];
        const wordJapaneseList = response.data.wordJapaneseList || [];
        const sentenceEnglishList = response.data.sentenceEnglishList || [];
        const sentenceGermanList = response.data.sentenceGermanList || [];
        const sentenceJapaneseList = response.data.sentenceJapaneseList || [];
        super.getDataService().wordStore.updateValue(
          {
            wordEnglishList,
            wordGermanList,
            wordJapaneseList
          }
        )
        super.getDataService().sentenceStore.updateValue(
          {
            sentenceEnglishList,
            sentenceGermanList,
            sentenceJapaneseList
          }
        )
      }
    );
  }

  goVocabularyPage() {
    super.getActionService().nextPageByUrl('/hw-vocabulary')
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Home Dashboard';
  }

}
