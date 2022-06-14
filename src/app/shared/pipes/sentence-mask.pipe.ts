import { Pipe, PipeTransform } from '@angular/core';
import { RuleUtils } from '../utils/rules-utils';

/**
 *  i am good -> i a_ g___
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

        const matchedJp = sentence.match(/\[([^\]]+)\]+|[一-龠]+/g) || [];

        if (matchedJp.length > 0) {
            return this.maskJapanese(sentence, startIndex, matchedJp);
        }

        return this.maskEnglish(sentence, startIndex);
    }

    maskJapanese(sentence = '', startIndex = 1, matchedJp = []) {
        return matchedJp.reduce((prev, cur) => {
            if (cur.includes('[')) {
                return prev.replace(cur, '')
            }
            return prev.replace(cur, new Array(cur.length).fill('_').join(''))
        }, sentence);
    }

    maskEnglish(sentence = '', startIndex = 1) {
        return sentence.split(' ').map((word) => {
            if (word && word.length > startIndex) {
                return word.split('').map((char, index) => {
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
