import { Injectable } from '@angular/core';
import CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  generateCV(_key: string, iv: string): string {
    if (!_key || !iv) {
      return '';
    }
    const message = new Date().getTime().toString();
    return this.encryptAES(message, _key, iv) ;
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

  generateUUID(): string {
    return CryptoJS.HmacMD5(new Date().getTime(), new Date().getTime().toString()).toString();
  }

}