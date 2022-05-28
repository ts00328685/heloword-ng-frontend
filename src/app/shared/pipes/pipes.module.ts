import { NgModule } from '@angular/core';
import { AnswereMaskPipe } from './answer-mask.pipe';

import { CommafyPipe } from './commafy.pipe';
import { SentenceMaskPipe } from './sentence-mask.pipe';

@NgModule({
    declarations: [
        CommafyPipe,
        SentenceMaskPipe,
        AnswereMaskPipe
    ],
    exports: [
        CommafyPipe,
        SentenceMaskPipe,
        AnswereMaskPipe
    ]
})
export class PipesModule { }
