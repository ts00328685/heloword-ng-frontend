import { NgModule } from '@angular/core';

import { CommafyPipe } from './commafy.pipe';

@NgModule({
    declarations: [
        CommafyPipe
    ],
    exports: [
        CommafyPipe
    ]
})
export class PipesModule { }
