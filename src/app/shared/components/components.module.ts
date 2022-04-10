import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { FuSelectPickerComponent } from './fu-select-picker/fu-select-picker.component';
import { ReactiveFormsModule } from '@angular/forms';
import { FuDateTimePickerComponent } from './fu-datetime-picker/fu-datetime-picker.component';
import { FuSidebarComponent } from './fu-sidebar/fu-sidebar.component';
import { DirectivesModule } from './../directives/directives.module';
import { FuHeaderComponent } from './fu-header/fu-header.component';
import { FuFooterComponent } from './fu-footer/fu-footer.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SlickCarouselModule } from 'ngx-slick-carousel';
import { RouterModule } from '@angular/router';
import { FuModalComponent } from './fu-modal/fu-modal.component';
import { FuLoaderComponent } from './hw-header/hw-header.component';
import { FullCalendarModule } from '@fullcalendar/angular';
import { FuFileUploaderComponent } from './fu-file-uploader/fu-file-uploader.component';
import { FuModalErrorComponent } from './fu-modal-error/fu-modal-error.component';
import { FuPageHeaderComponent } from './fu-page-header/fu-page-header.component';
import { FuSurveyHeaderComponent } from './fu-survey/header/fu-survey-header.component';
import { FuSurveyStep1Component } from './fu-survey/step1/fu-survey-step1.component';
import { FuSurveyStep7Component } from './fu-survey/step7/fu-survey-step7.component';
import { FuSurveyRetirementStep2Component } from './fu-survey/retirement/step2/fu-survey-retirement-step2.component';
import { FuSurveyRetirementStep3Component } from './fu-survey/retirement/step3/fu-survey-retirement-step3.component';
import { FuSurveyRetirementStep4Component } from './fu-survey/retirement/step4/fu-survey-retirement-step4.component';
import { FuSurveyRetirementStep5Component } from './fu-survey/retirement/step5/fu-survey-retirement-step5.component';
import { FuSurveyRetirementStep5_2Component } from './fu-survey/retirement/step5-2/fu-survey-retirement-step5-2.component';
import { FuSurveyRetirementStep5_1Component } from './fu-survey/retirement/step5-1/fu-survey-retirement-step5-1.component';
import { FuSurveyRetirementStep6Component } from './fu-survey/retirement/step6/fu-survey-retirement-step6.component';
import { FuSurveyStepsComponent } from './fu-survey/steps/fu-survey-steps.component';
import { FuSurveyOtherStep2Component } from './fu-survey/other/step2/fu-survey-other-step2.component';
import { FuSurveyOtherStep3Component } from './fu-survey/other/step3/fu-survey-other-step3.component';
import { FuSurveyOtherStep4Component } from './fu-survey/other/step4/fu-survey-other-step4.component';
import { FuSurveyOtherStep5_1Component } from './fu-survey/other/step5-1/fu-survey-other-step5-1.component';
import { FuSurveyOtherStep5_2Component } from './fu-survey/other/step5-2/fu-survey-other-step5-2.component';
import { FuSurveyOtherStep5Component } from './fu-survey/other/step5/fu-survey-other-step5.component';
import { FuSurveyOtherStep6Component } from './fu-survey/other/step6/fu-survey-other-step6.component';
import { FuSurveyHousingStep2Component } from './fu-survey/housing/step2/fu-survey-housing-step2.component';
import { FuSurveyHousingStep3Component } from './fu-survey/housing/step3/fu-survey-housing-step3.component';
import { FuSurveyHousingStep4Component } from './fu-survey/housing/step4/fu-survey-housing-step4.component';
import { FuSurveyHousingStep5_1Component } from './fu-survey/housing/step5-1/fu-survey-housing-step5-1.component';
import { FuSurveyHousingStep5_2Component } from './fu-survey/housing/step5-2/fu-survey-housing-step5-2.component';
import { FuSurveyHousingStep5Component } from './fu-survey/housing/step5/fu-survey-housing-step5.component';
import { FuSurveyHousingStep6Component } from './fu-survey/housing/step6/fu-survey-housing-step6.component';
import { NgxQRCodeModule } from '@techiediaries/ngx-qrcode';
import { CurrencyMaskInputMode, NgxCurrencyModule } from 'ngx-currency';
import { FuSurveyStartupStep2Component } from './fu-survey/startup/step2/fu-survey-startup-step2.component';
import { FuSurveyStartupStep3Component } from './fu-survey/startup/step3/fu-survey-startup-step3.component';
import { FuSurveyStartupStep4Component } from './fu-survey/startup/step4/fu-survey-startup-step4.component';
import { FuSurveyStartupStep5_1Component } from './fu-survey/startup/step5-1/fu-survey-startup-step5-1.component';
import { FuSurveyStartupStep5_2Component } from './fu-survey/startup/step5-2/fu-survey-startup-step5-2.component';
import { FuSurveyStartupStep5Component } from './fu-survey/startup/step5/fu-survey-startup-step5.component';
import { FuSurveyStartupStep6Component } from './fu-survey/startup/step6/fu-survey-startup-step6.component';
import { FuSurveyEducationStep2Component } from './fu-survey/education/step2/fu-survey-education-step2.component';
import { FuSurveyEducationStep3Component } from './fu-survey/education/step3/fu-survey-education-step3.component';
import { FuSurveyEducationStep4Component } from './fu-survey/education/step4/fu-survey-education-step4.component';
import { FuSurveyEducationStep5_1Component } from './fu-survey/education/step5-1/fu-survey-education-step5-1.component';
import { FuSurveyEducationStep5_2Component } from './fu-survey/education/step5-2/fu-survey-education-step5-2.component';
import { FuSurveyEducationStep5Component } from './fu-survey/education/step5/fu-survey-education-step5.component';
import { FuSurveyEducationStep6Component } from './fu-survey/education/step6/fu-survey-education-step6.component';

export const customCurrencyMaskConfig = {
    align: 'center',
    allowNegative: true,
    allowZero: true,
    decimal: '.',
    precision: 0,
    prefix: '',
    suffix: '',
    thousands: ',',
    nullable: true,
    min: null,
    max: null,
    inputMode: CurrencyMaskInputMode.NATURAL
};

@NgModule({
  imports: [
    CommonModule,
    SlickCarouselModule,
    RouterModule,
    FullCalendarModule,
    DirectivesModule,
    ReactiveFormsModule,
    NgbPaginationModule,
    NgxQRCodeModule,
    // NgxCurrencyModule.forRoot(customCurrencyMaskConfig)
  ],
  declarations: [
    FuHeaderComponent,
    FuFooterComponent,
    FuModalComponent,
    FuLoaderComponent,
    FuSidebarComponent,
    FuFileUploaderComponent,
    FuDateTimePickerComponent,
    FuModalErrorComponent,
    FuSelectPickerComponent,
    FuPageHeaderComponent,
    FuSurveyStepsComponent,
    FuSurveyHeaderComponent,
    FuSurveyStep1Component,
    FuSurveyStep7Component,

    FuSurveyRetirementStep2Component,
    FuSurveyRetirementStep3Component,
    FuSurveyRetirementStep4Component,
    FuSurveyRetirementStep5Component,
    FuSurveyRetirementStep5_1Component,
    FuSurveyRetirementStep5_2Component,
    FuSurveyRetirementStep6Component,

    FuSurveyOtherStep2Component,
    FuSurveyOtherStep3Component,
    FuSurveyOtherStep4Component,
    FuSurveyOtherStep5Component,
    FuSurveyOtherStep5_1Component,
    FuSurveyOtherStep5_2Component,
    FuSurveyOtherStep6Component,

    FuSurveyHousingStep2Component,
    FuSurveyHousingStep3Component,
    FuSurveyHousingStep4Component,
    FuSurveyHousingStep5Component,
    FuSurveyHousingStep5_1Component,
    FuSurveyHousingStep5_2Component,
    FuSurveyHousingStep6Component,

    FuSurveyStartupStep2Component,
    FuSurveyStartupStep3Component,
    FuSurveyStartupStep4Component,
    FuSurveyStartupStep5Component,
    FuSurveyStartupStep5_1Component,
    FuSurveyStartupStep5_2Component,
    FuSurveyStartupStep6Component,

    FuSurveyEducationStep2Component,
    FuSurveyEducationStep3Component,
    FuSurveyEducationStep4Component,
    FuSurveyEducationStep5Component,
    FuSurveyEducationStep5_1Component,
    FuSurveyEducationStep5_2Component,
    FuSurveyEducationStep6Component,
  ],
  exports: [
    FuHeaderComponent,
    FuFooterComponent,
    FuModalComponent,
    FuLoaderComponent,
    FuSidebarComponent,
    FuFileUploaderComponent,
    FuDateTimePickerComponent,
    FuModalErrorComponent,
    FuSelectPickerComponent,
    FuSurveyStepsComponent,
    FuPageHeaderComponent,
  ]
})
export class ComponentsModule { }
