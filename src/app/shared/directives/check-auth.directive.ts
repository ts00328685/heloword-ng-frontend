import { Directive, Input, TemplateRef, ViewContainerRef, ElementRef } from '@angular/core';
import { BaseComponent } from '../base/base.component';

@Directive({
    selector: '[checkAuth]'
})
export class CheckAuthDirective extends BaseComponent {

    constructor(
        private _elementRef: ElementRef,
        private _templateRef: TemplateRef<any>,
        private _viewContainer: ViewContainerRef
    ) {
        super();
    }

    /* 陣列第一個為function id, 第二個Optional參數傳true則會幫element加disabled attribute */
    /* ex. ['fu002010'] or ['fu002010', true] */
    @Input() set checkAuth(param: string[]) {
        if (super.getAuthService().hasAnyRole([param[0]])) {
            this._viewContainer.createEmbeddedView(this._templateRef);
        } else {
            this.handleViewChange(!!param[1]);
        }
    }

    private handleViewChange(isDisabled: boolean) {
        if(!isDisabled) {
            this._viewContainer.clear();
        } else {
            this._viewContainer.createEmbeddedView(this._templateRef);
            this._templateRef.elementRef.nativeElement.previousSibling.disabled = true;
        }
    }
    
}
