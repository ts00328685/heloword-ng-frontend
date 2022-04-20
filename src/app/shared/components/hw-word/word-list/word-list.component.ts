import { Input, ViewChild } from '@angular/core';
import { Component } from '@angular/core';
import { IonInfiniteScroll } from '@ionic/angular';
import { Observable } from 'rxjs';
import { BaseComponent } from 'src/app/shared/base/base.component';
import { Sentence, Word } from 'src/app/shared/models/common-models';
import { WordStore } from 'src/app/shared/services/data.service';

@Component({
  selector: 'hw-word-list',
  templateUrl: './word-list.component.html',
  styleUrls: ['./word-list.component.scss'],
})
export class WordListComponent extends BaseComponent {

  @ViewChild(IonInfiniteScroll) infiniteScroll: IonInfiniteScroll;

  @Input()
  wordListOriginal: Array<Word> = [];
  wordListSplice: Array<Word> = [];
  interval = 50;
  start = 0;
  end = this.start + this.interval;

  init() {
    super.getDataService().wordStore.dataStore$.subscribe(_=> {
      this.wordListSplice = this.wordListOriginal.slice(this.start, this.end);
    })
  }

  loadData(event) {
    setTimeout(() => {
      super.debug('Done');
      this.start += this.interval;
      this.end += this.interval;
      this.wordListSplice.push(...this.wordListOriginal.slice(this.start, this.end));

      // App logic to determine if all data is loaded
      // and disable the infinite scroll
      if (this.wordListSplice.length >= this.wordListOriginal.length) {
        event.target.disabled = true;
      }
      event.target.complete();
    }, 0);
  }

  toggleInfiniteScroll() {
    this.infiniteScroll.disabled = !this.infiniteScroll.disabled;
  }

  onSearchChange(searchText: string) {
    this.wordListSplice = this.wordListOriginal.filter(
      word => word.word.includes(searchText)
    ).slice(0, 20);
  }

}
