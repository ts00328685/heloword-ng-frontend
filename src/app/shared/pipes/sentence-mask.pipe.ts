import { Pipe, PipeTransform } from '@angular/core';
import { RuleUtils } from '../utils/rules-utils';

/**
 *  i am good -> i a* g***
 */
@Pipe({
    name: 'sentenceMask'
})
export class SentenceMaskPipe implements PipeTransform {
    rules = RuleUtils.getInstance();
    transform(sentence = '', startIndex = 1, enable = true): string {
        if (!enable) {
            return sentence;
        }
        
        return sentence.split(' ').map((word)=> {
            if (word && word.length > startIndex) {
                return word.split('').map((char, index)=> {
                    if (index >= startIndex && this.rules.isEnglish(char)) {
                        return '_'
                    } else {
                        return char;
                    }
                }).join('');
            } else {
                return word;
            }
        }).join(' ');
    }

}
