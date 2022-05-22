import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DirectivesModule } from '../directives/directives.module';
import { HwBottomTabsComponent } from './hw-bottom-tabs/hw-bottom-tabs.component';

import { HwHeaderComponent } from './hw-header/hw-header.component';
import { ModalWordSettingComponent } from './hw-modal/modal-word-setting/modal-word-setting.component';
import { QuizSettingItemComponent } from './hw-modal/modal-word-setting/quiz-setting-item/quiz-setting-item.component';
import { WordCardComponent } from './hw-word/word-card/word-card.component';
import { WordListComponent } from './hw-word/word-list/word-list.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DirectivesModule,
    RouterModule
  ],
  declarations: [
    HwHeaderComponent,
    ModalWordSettingComponent,
    WordCardComponent,
    WordListComponent,
    QuizSettingItemComponent,
    HwBottomTabsComponent
  ],
  exports: [
    HwHeaderComponent,
    ModalWordSettingComponent,
    WordCardComponent,
    WordListComponent,
    QuizSettingItemComponent,
    HwBottomTabsComponent
  ]
})
export class ComponentsModule { }
