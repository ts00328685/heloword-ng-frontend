import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { HwReviewQuizRecordDetailPage } from './hw-review-quiz-record-detail.page';

describe('HwReviewQuizRecordDetailPage', () => {
  let component: HwReviewQuizRecordDetailPage;
  let fixture: ComponentFixture<HwReviewQuizRecordDetailPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ HwReviewQuizRecordDetailPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(HwReviewQuizRecordDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
