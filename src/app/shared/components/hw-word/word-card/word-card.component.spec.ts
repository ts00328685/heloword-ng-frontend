import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { WordCardComponent } from './word-card.component';

describe('WordCardComponent', () => {
  let component: WordCardComponent;
  let fixture: ComponentFixture<WordCardComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ WordCardComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(WordCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
