import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { HwHomeQe0010100Page } from './hw-home-qe001-0100.page';



describe('HwHomeQe0010100Page', () => {
  let component: HwHomeQe0010100Page;
  let fixture: ComponentFixture<HwHomeQe0010100Page>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ HwHomeQe0010100Page ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(HwHomeQe0010100Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
