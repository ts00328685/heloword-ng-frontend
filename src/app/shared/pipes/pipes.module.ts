import { NgModule } from '@angular/core';

import { CommafyPipe } from './commafy.pipe';
import { SentenceMaskPipe } from './sentence-mask.pipe';

@NgModule({
    declarations: [
        CommafyPipe,
        SentenceMaskPipe
    ],
    exports: [
        CommafyPipe,
        SentenceMaskPipe
    ]
})
export class PipesModule { }
