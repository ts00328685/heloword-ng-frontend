import { Directive, ElementRef, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
    selector: '[upper-case]'
})
export class UpperCaseDirective {

    /**
     * @constructor
     */
    constructor(private elementRef: ElementRef, private control: NgControl) { }

    @HostListener('blur')
    onBlur() {
        const upperCaseValue = this.elementRef.nativeElement.value.toUpperCase();
        this.elementRef.nativeElement.value = upperCaseValue;
        this.control.control.setValue(upperCaseValue);
    }
}
