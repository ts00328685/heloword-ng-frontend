import { Directive, ElementRef, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
    selector: '[lower-case]'
})
export class LowerCaseDirective {

    /**
     * @constructor
     */
    constructor(private elementRef: ElementRef, private control: NgControl) { }

    @HostListener('blur')
    onBlur() {
        const lowerCaseValue = this.elementRef.nativeElement.value.toLowerCase();
        this.elementRef.nativeElement.value = lowerCaseValue;
        this.control.control.setValue(lowerCaseValue);
    }
}
