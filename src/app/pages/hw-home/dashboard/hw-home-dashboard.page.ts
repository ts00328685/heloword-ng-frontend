import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { Sentence } from 'src/app/shared/models/common-models';
import { WordStore } from 'src/app/shared/services/data.service';
import { UtilsService } from 'src/app/shared/services/utils.service';

@Component({
  selector: 'hw-home-dashboard',
  templateUrl: './hw-home-dashboard.page.html',
  styleUrls: ['./hw-home-dashboard.page.scss'],
})
export class HwHomeDashboardPage extends BasePage<any> {

  wordStore$ = super.getDataService().wordStore.dataStore$;
  sentenceStore$ = super.getDataService().sentenceStore.dataStore$;

  titleMap = UtilsService.getWordSentenceTitleMap();

  init(): void {
    this.retrieveData();
  }

  retrieveData() {
    const ds = super.getDataService();
    if (!ds.wordStore.isEmpty() || !ds.sentenceStore.isEmpty()) {
      return;
    }

    super.getApiService().doPost('/frontend-api/api/fe/home/dashboard').subscribe(
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

        this.fillWordWithSentence(super.getDataService().wordStore.getValue(), super.getDataService().sentenceStore.getValue().sentenceEnglishList);
        const exMsg = '\nLog in for more data.';
        const msg = 'Currently still under construction, might be updated anytime!';
        super.getViewService().showAlert(super.getAuthService().isUserLoggedIn() ? msg : msg + exMsg);
      }
    );
  }

  fillWordWithSentence(words: WordStore, sentences: Sentence[]) {

    if (!super.getAuthService().isUserLoggedIn()) {
      super.debug('Not logged in, ignoring fillWordWithSentence');
      return;
    }

    setTimeout(() => {

      const sentenceMap = sentences.reduce((pre, cur, idx) => {
        if (!cur.word) {
          return pre;
        }
        return {
          ...pre,
          [cur.word]: cur.sentence
        };
      }, {});

      Object.keys(words).forEach(key => {
        setTimeout(() => {
          const lang = key.substring(4);
          if (!lang.toLowerCase().includes('english')) {
            return;
          }

          (words[key] as Sentence[] || []).forEach(word => {
            word.sentence = sentenceMap[word.word] || '';
          });
        });
      })

    });


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
    return 'Home Dashboard';
  }

}
