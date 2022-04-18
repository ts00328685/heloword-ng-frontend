import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BaseService } from '../base/base.service';
import { Sentence, Word } from '../models/common-models';
import { RuleUtils } from '../utils/rules-utils';

@Injectable({
  providedIn: 'root'
})
export class DataService extends BaseService {

  public wordStore = new DataStore<WordStore>();
  public sentenceStore = new DataStore<SentenceStore>();

  public clearAllStore() {
    Object.keys(this).forEach(k => {
      if (this[k] instanceof DataStore) {
        this[k].clear();
      }
    })
  }

}

export interface WordStore {
  wordEnglishList: Array<Word>;
  wordGermanList: Array<Word>;
  wordJapaneseList: Array<Word>;
}
export interface SentenceStore {
  sentenceEnglishList: Array<Sentence>;
  sentenceGermanList: Array<Sentence>;
  sentenceJapaneseList: Array<Sentence>;
}

export class DataStore<T> {

  private readonly dataStore = new BehaviorSubject<T>({} as T);
  public dataStore$ = this.dataStore.asObservable();

  public getValue(): T {
    return this.dataStore.getValue();
  }

  public updateValue(value: T) {
    this.dataStore.next(value);
  }

  public isEmpty(): boolean {
    return RuleUtils.getInstance().isEmptyObject(this.getValue());
  }

  public clear() {
    this.dataStore.next({} as T);
  }
}