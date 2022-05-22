import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { HwReviewQuizRecordPage } from './hw-review-quiz-record.page';

describe('HwReviewQuizRecordPage', () => {
  let component: HwReviewQuizRecordPage;
  let fixture: ComponentFixture<HwReviewQuizRecordPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ HwReviewQuizRecordPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(HwReviewQuizRecordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
