import { Injectable } from '@angular/core';
import CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  constructor() {
    window['utilsService'] = this;
  }

  generateCV(): string {
    const message = new Date().getTime().toString();
    return this.encryptAES(message, "", "") ;
  }

  decryptAES(content: string, key: string, iv: string): string {
    return CryptoJS.AES.decrypt(content, CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Utf8.parse(iv) })
  }

  encryptAES(content: string, key: string, iv: string): string {
    return CryptoJS.AES.encrypt(
      content,
      CryptoJS.enc.Utf8.parse(key),
      { iv: CryptoJS.enc.Utf8.parse(iv) }
    ).toString();
  }

}