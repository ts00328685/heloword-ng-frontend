import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';
import { ModalWordSettingComponent } from 'src/app/shared/components/hw-modal/modal-word-setting/modal-word-setting.component';

@Component({
  selector: 'hw-vocabulary-list',
  templateUrl: './hw-vocabulary-list.page.html',
  styleUrls: ['./hw-vocabulary-list.page.scss'],
})
export class HwVocabularyListPage extends BasePage<any> {

  wordStore$ = super.getDataService().wordStore.dataStore$;
  sentenceStore$ = super.getDataService().sentenceStore.dataStore$;
  
  popover;
  wordListOriginal = [];

  init(): void {
    this.wordListOriginal = super.getPageData().wordListOriginal;
    if (this.getRules().isEmptyArray(this.wordListOriginal)) {
      super.getActionService().goBackHome();
    }
  }

  ionViewWillEnter() {
    super.debug('ionViewWillEnter')
  }

  async presentPopover(ev: any) {
    this.popover = await super.getPopoverController().create({
      component: ModalWordSettingComponent,
      cssClass: 'my-custom-class',
      event: ev,
      translucent: false,
    });
    return await this.popover.present();
  }

  onFabClick(e) {
    this.presentPopover(e);
  }
  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Vocabulary List';
  }

}
