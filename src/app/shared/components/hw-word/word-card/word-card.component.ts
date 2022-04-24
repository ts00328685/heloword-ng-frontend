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
  word: Sentence;
  
  init() {

  }

  pronounce(word: string, language = 'en-US') {
    if ('speechSynthesis' in window) {

      let lang = 'en-US';

      if (language === 'ch') {
        lang = 'zh-TW';
      }
  
      if (language === 'jp') {
        lang = 'ja-JP';
      }
  
      if (language === 'de') {
        lang = 'de-DE';
      }
   
      const synthesis = window.speechSynthesis;

      // Get the first `en` language voice in the list
      const voice = synthesis.getVoices().filter( aVoice => aVoice.lang === lang)[0];

      // Create an utterance object
      const utterance = new SpeechSynthesisUtterance(word);

      // Set utterance properties
      utterance.voice = voice;
      utterance.pitch = 1.5;
      utterance.rate = 1.05;
      utterance.volume = 0.3;

      // Speak the utterance
      synthesis.speak(utterance);

    } else {
      super.error('Text-to-speech not supported.');
    }
  }
}
