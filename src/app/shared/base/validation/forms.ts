import { RuleUtils } from './../../utils/rules-utils';
import { ElementRef } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { pairwise, startWith } from 'rxjs/operators';

export class Forms<T> {

    static formBuilder = new FormBuilder();

    form: FormGroup;
    formErrors: T;

    formElement: ElementRef;

    private valueChanged: (data: T) => void;

    private subscription: Subscription = new Subscription();

    constructor(
        formGroup: T,
        valueChanged: (data: T) => void,
        formElement: ElementRef,
        valueChangeCallback: (current: T) => void = (current) => { },
        valuePairChangeCallback: (prev: T, next: T) => void = (prev, next) => { }
    ) {

        this.formElement = formElement;

        this.form = Forms.formBuilder.group(formGroup);

        this.valueChanged = valueChanged;

        this.subscription.add(this.form.valueChanges.pipe(startWith(formGroup)).subscribe(valueChangeCallback));

        this.subscription.add(this.form.valueChanges
            .pipe(
                startWith(formGroup),
                pairwise())
            .subscribe(
                ([prev, next]: [T, T]) => {
                    if (valuePairChangeCallback) {
                        valuePairChangeCallback(prev, next);
                    }
                    if (this.hasFormErrors()) {
                        for (const eachKey in formGroup) {
                            if (prev[eachKey] !== next[eachKey]) {
                                this.deleteFormError(eachKey);
                            }
                        }
                    }
                })
        );

    }

    addFormArray(key: string) {
        this.form.addControl(key, new FormArray([
            new FormControl(null)
        ]));
    }

    getForm(): FormGroup {
        return this.form;
    }

    onFormValueChanged(data: T) {
        this.resetFormErrors();
        this.valueChanged(data);
    }

    isFormValid(): boolean {
        this.onFormValueChanged(this.getAllFormValues());

        if (this.hasFormErrors()) {
            this.scrollToFirstError();
            return false;
        }
        return true;
    }

    getAllFormValues(): T {
        if (this.form == null) {
            return {} as T;
        }
        return this.form.value as T;
    }

    getAllFormErrors() {
        if (this.formErrors == null) {
            this.resetFormErrors();
        }
        return this.formErrors;
    }

    setFormErrors(key: string, msg: string) {
        this.getAllFormErrors()[key] = msg;
    }

    deleteFormError(key: string) {
        delete this.getAllFormErrors()[key];
    }

    resetFormErrors() {
        this.formErrors = {} as T;
    }

    hasFormErrors(): boolean {
        for (const key in this.formErrors) {
            if (Object.prototype.hasOwnProperty.call(this.formErrors, key)) {
                return true;
            }
        }
        return false;
    }

    getValue(key: string): string {
        return this.form.controls[key].value;
    }

    getNonEmptyValues(): Partial<T> {
        const rules = RuleUtils.getInstance();
        const nonEmptyValues = {};
        const formValues = this.getAllFormValues();
        for (let key of Object.keys(formValues)) {
            if (rules.isNotBlank(formValues[key])) {
                nonEmptyValues[key] = this.getValue(key);
            }
        }
        return nonEmptyValues;
    }

    setValue(key: string, value: any) {
        this.form.controls[key].setValue(value);
    }

    scrollToFirstError() {

    }

    unsubscribe() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }

}
