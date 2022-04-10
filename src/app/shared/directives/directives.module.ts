import { CheckAuthDirective } from './check-auth.directive';
import { UiImageLoaderDirective } from './ui-image-loader-.directive';
import { UpperCaseDirective } from './upper-case.directive';
import { LowerCaseDirective } from './lower-case.directive';
import { NgModule } from '@angular/core';
import { NumberCommaDirective } from './number-comma.directive';

@NgModule({
  declarations: [
    UpperCaseDirective,
    LowerCaseDirective,
    UiImageLoaderDirective,
    CheckAuthDirective,
    NumberCommaDirective
  ],
  exports: [
    UpperCaseDirective,
    LowerCaseDirective,
    UiImageLoaderDirective,
    CheckAuthDirective,
    NumberCommaDirective
  ]
})
export class DirectivesModule { }
