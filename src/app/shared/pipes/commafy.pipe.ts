import { CommonUtils } from './../utils/common-utils';
import { RuleUtils } from './../utils/rules-utils';
import { Pipe, PipeTransform } from '@angular/core';

/**
 *  100000 -> 100,000
 */
@Pipe({
    name: 'commafy'
})
export class CommafyPipe implements PipeTransform {

    transform(amount: any, scale?: number): any {
        if (RuleUtils.getInstance().isNumeric(amount)) {
            if (RuleUtils.getInstance().isNumeric(scale)) {
                return CommonUtils.commafyWithFixedDecimal(amount.toString(), scale);
            } else {
                return CommonUtils.commafy(amount);
            }
        }
        return '0';
    }

}
