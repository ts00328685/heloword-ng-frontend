import { CommonUtils } from './../utils/common-utils';
import { Directive, ElementRef, Input, AfterViewInit, HostListener, SimpleChanges, OnChanges, Output, EventEmitter } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
    selector: '[currencyMask]'
})
export class NumberCommaDirective implements AfterViewInit, OnChanges {

    @Input('currencyMask')
    comma: string;

    @Input() allowZero: boolean = true;

    @Input('value')
    set value(val: string) {
        this.doCommafy();
    }

    @Input('maxLength')
    maxLength: number;

    @Input('ngModel')
    set ngModel(val: string) {
        if (!this.focusMode) {
            this.doNgModelCommafy(val);
        }
    }

    readonly numberReg = /^(-?(?!(0)))\d*\.{0,1}\d+$/;

    @Output() ngModelChange = new EventEmitter();

    private focusMode: boolean = false;

    /**
     * @constructor
     */
    constructor(private elementRef: ElementRef, private control: NgControl) { }

    /**
     * @implement
     */
    ngAfterViewInit() {
        const value = this.elementRef.nativeElement.value;
        this.elementRef.nativeElement.value = this.clearCommafy(value);
        this.doCommafy();
        if (this.maxLength) {
            // 塞maxLength
            this.elementRef.nativeElement.maxLength = CommonUtils.getInstance().commafy(
                new Array(this.maxLength).fill('1', 0, this.maxLength).join('')).length;
        }
    }

    @HostListener('focus') onFocus() {
        let value = this.elementRef.nativeElement.value;
        let commafy = this.elementRef.nativeElement.dataset.commafy;
        this.focusMode = true;
        if (value && commafy == '1') {
            this.elementRef.nativeElement.value = this.clearCommafy(value);
        }
    }

    @HostListener('paste', ['$event'])
    @HostListener('keyup', ['$event']) onkeyup(e) {
        // super.debug(e)
        this.numberCheck(e);
    }

    @HostListener('blur', ['$event']) onblur(e) {
        // this.numberCheck(e);
        this.doCommafy();
        this.focusMode = false;
    }
    /**
     *
     */
    @HostListener('ngModelChange', ['$event']) onNgModelChange(e) {
        this.doCommafy();

    }
    /**
     * @implement
     */
    ngOnChanges(changes: SimpleChanges) {
        // super.debug("ngOnChanges");
    }

    /** 數字檢查 */
    private numberCheck(e) {
        let val: string = e.target.value;
        for (let i = 0, l = val.length; i < l; i++) {
            let c = val[i].charCodeAt(0);

            if (c >= 0xFF00 && c <= 0xFFEF) {
                return; // 全形 不處理
            } else if (val[i].match(/[^\x00-\xff]/ig)) {
                return; // 注音,國字不處理
            } else {
                continue;
            }
        }
        let value: string = e.target.value.replace(/[^\d.-]/g, '');
        if (value != e.target.value) {

            if (value && this.numberReg.test(value)) {
                e.target.value = value;
                // this.ngModelChange.emit(value);
                this.control.control.setValue(this.checkMaxLength(value));
            } else {
                e.target.value = '';
                this.control.control.setValue(value);
                // this.ngModelChange.emit('');
            }
        } else {
            if (value && !this.numberReg.test(value)) { // 有值卻不符合數字格式
                let comboVal = '';
                let neg = /^[-].*$/.test(value);

                if (this.allowZero && /^0?0*0$/.test(value)) {
                    // 如果允許為0，且如果全為0的話，就放個0進去
                    comboVal = '0';
                }
                else {
                    // 其他狀況就如常把垃圾丟掉
                    comboVal = this.removeInvalidStr(value);
                }

                value = (neg ? '-' : '') + comboVal;
                e.target.value = value;
                this.control.control.setValue(this.checkMaxLength(value));
            }
        }
    }

    /**
     * 把不符合常規的數字格式處理掉
     * 如 01a2d31e -> 123
     * 0 -> ''
     * 00000 -> ''
     * . -> 0.
     * @param value
     */
    private removeInvalidStr(value): string {
        let valArr = value.split('');
        let comboVal = '', nodec = true;
        for (let v of valArr) {
            if (comboVal == '' && /[0]/.test(v)) { // 去掉0開頭的
                continue;
            }
            else if (/\d/.test(v)) {
                comboVal += v;
            } else if (nodec && /[.]/.test(v)) {
                if (comboVal == '') {
                    comboVal = '0';
                }
                comboVal += v;
                nodec = false;
            }
        }
        return comboVal;
    }



    /** 加千分位符號 */
    private doCommafy() {
        let value = this.elementRef.nativeElement.value;
        if (value && this.numberReg.test(value)) {
            this.elementRef.nativeElement.dataset.commafy = '1';
            setTimeout(() => {
                // 如果值沒異動的話
                if (this.elementRef.nativeElement.value === value) {
                    this.elementRef.nativeElement.value = CommonUtils.getInstance().commafy(this.checkMaxLength(value));
                }
            }, 0);
        } else {
            this.elementRef.nativeElement.dataset.commafy = '';
        }
    }

    private doNgModelCommafy(value) {
        if (value && this.numberReg.test(value)) {
            this.elementRef.nativeElement.dataset.commafy = '1';
            this.elementRef.nativeElement.value = CommonUtils.getInstance().commafy(this.checkMaxLength(value));
        } else {
            this.elementRef.nativeElement.dataset.commafy = '';
        }
    }

    private clearCommafy(value) {
        return value.replace(new RegExp(',', 'g'), '');
    }

    /**
     * 檢查最大值
     */
    private checkMaxLength(val: string) {
        if (this.maxLength) {
            let value = this.clearCommafy(val);
            if (value.length > this.maxLength) {
                value = value.substr(0, this.maxLength);
            }
            return value;
        }
        return val;
    }

}
