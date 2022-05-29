import { Pipe, PipeTransform } from '@angular/core';

/**
 *  answerMask: 'good'
 *  i am good -> i am ____
 */
@Pipe({
    name: 'answerMask'
})
export class AnswereMaskPipe implements PipeTransform {

    transform(sentence = '', answer: string, enable = true): string {
        if (!enable || !answer) {
            return sentence;
        }

        return sentence.split(' ').map((word) => {

            if (!word || word.length < answer.length) {
                return word;
            }

            const trimmedWord = word.replace(/(\W) */g, '');

            if (trimmedWord.toLowerCase().includes(answer.toLowerCase())) {
                return '____'
            } 

            return word;

        }).join(' ');
    }

}
