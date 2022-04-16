import { BaseComponent } from 'src/app/shared/base/base.component';
import { environment } from 'src/environments/environment';
import {
  Directive,
  Renderer2,
  ElementRef,
  HostListener,
  Output,
  EventEmitter,
  Input
} from '@angular/core';

@Directive({
  selector: '[ui-image-loader]'
})
export class UiImageLoaderDirective extends BaseComponent {

  @Output()
  imageLoad: EventEmitter<boolean> = new EventEmitter();

  @Input()
  loadingSrc = '';
  @Input()
  errorSrc = '';

  @Input()
  src = '';

  loadingElement = {} as any;

  constructor(
    private renderer: Renderer2,
    private el: ElementRef
  ) {
    super();
  }

  init(): void {
    if (this.loadingSrc) {
      $(this.el.nativeElement).hide();
      this.loadingElement = document.createElement('img');
      this.loadingElement.setAttribute('src', this.loadingSrc);
      $(this.el.nativeElement).parent().append(this.loadingElement);
    }
    this.renderer.setAttribute(this.el.nativeElement, 'src', environment.imgBaseUrl + this.src);
  }

  @HostListener('load') onLoad() {
    this.imageLoad.emit(true);
    if (this.loadingSrc) {
      $(this.loadingElement).remove();
      $(this.el.nativeElement).show();
    }
    super.debug('image loaded', this.el.nativeElement.src);
  }
  
  @HostListener('error') onError() {
    this.imageLoad.emit(false);
    if (this.loadingSrc) {
      $(this.loadingElement).remove();
    }
    this.renderer.setAttribute(this.el.nativeElement, 'src', this.errorSrc);
  }
}
