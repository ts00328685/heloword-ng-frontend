import { Component, Input, OnInit } from '@angular/core';
import { BaseComponent } from 'src/app/shared/base/base.component';
import { Sentence, Word } from 'src/app/shared/models/common-models';

@Component({
  selector: 'hw-word-card',
  templateUrl: './word-card.component.html',
  styleUrls: ['./word-card.component.scss'],
})
export class WordCardComponent extends BaseComponent{


  @Input()
  word: Word;
  
  init() {

  }

  pronounce(word: string) {
    if ('speechSynthesis' in window) {
   
      const synthesis = window.speechSynthesis;

      // Get the first `en` language voice in the list
      const voice = synthesis.getVoices().filter( aVoice => aVoice.lang === 'en')[0];

      // Create an utterance object
      const utterance = new SpeechSynthesisUtterance(word);

      // Set utterance properties
      utterance.voice = voice;
      utterance.pitch = 1.5;
      utterance.rate = 1.05;
      utterance.volume = 1.6;

      // Speak the utterance
      synthesis.speak(utterance);

    } else {
      super.error('Text-to-speech not supported.');
    }
  }
}
