import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { HwHeaderComponent } from './hw-header/hw-header.component';
import { ModalWordSettingComponent } from './hw-modal/modal-word-setting/modal-word-setting.component';
import { WordCardComponent } from './hw-word/word-card/word-card.component';
import { WordListComponent } from './hw-word/word-list/word-list.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  declarations: [
    HwHeaderComponent,
    ModalWordSettingComponent,
    WordCardComponent,
    WordListComponent
  ],
  exports: [
    HwHeaderComponent,
    ModalWordSettingComponent,
    WordCardComponent,
    WordListComponent
  ]
})
export class ComponentsModule { }
