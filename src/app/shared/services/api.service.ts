import { ViewService } from './view.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Device } from '@ionic-native/device';
import { environment } from 'src/environments/environment';
import { catchError, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { DatePipe } from '@angular/common';
import { UtilsService } from './utils.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  userIp = '127.0.0.1';

  constructor(private httpClient: HttpClient, private viewService: ViewService, private datePipe: DatePipe, private utilsService: UtilsService) {
    window['apiService'] = this;
    this.retrieveUserIp();
  }

  doGet(url: string, params: HttpParams = new HttpParams()): Observable<any> {
    const headers = new HttpHeaders().set('cv', this.utilsService.generateCV());;
    return this.httpClient.get(environment.backendBaseUrl + url, { headers, params: params })
      .pipe(
        catchError(this.handleHttpError.bind(this))
      );
  }

  doPost(url: string, params: any = {}, defaultParamFormat = true, baseUrl = environment.backendBaseUrl) {
    const headers = new HttpHeaders().set('cv', this.utilsService.generateCV());;
    const _params = defaultParamFormat
      ? { ... this.getFidoServerCommonHeader(), body: params }
      : params;

    return this.httpClient.post(baseUrl + url, _params, {headers})
      .pipe(
        catchError(this.handleHttpError.bind(this)),
        tap(rs => {
          console.log('doPost', url, JSON.stringify({
            ... this.getFidoServerCommonHeader(),
            body: params
          }), JSON.stringify(rs));
        })
      );
  }

  handleHttpError(error: any): Observable<CommonResponse> {
    console.error('handleHttpError', JSON.stringify(error));
    this.viewService.dismissLoading();
    return of({
      header: { code: '9999', txTime: this.getCurrentTime() },
      body: {}
    });
  }

  retrieveUserIp(): void {
    this.httpClient.get('https://jsonip.com')
      .pipe(this.handleHttpError.bind(this))
      .subscribe(
        (value: any) => {
          this.userIp = value.ip || this.userIp;
          console.log('clientIp:', this.userIp);
        },
        (error) => {
          console.log(error);
        }
      );
  }

  getFidoServerCommonHeader() {
    return {
      'header': {
        'channelCode': 'CCA',
        'appVersion': environment.appVersion,
        'deviceUuid': Device.uuid,
        'deviceVersion': Device.version,
        'deviceBrand': Device.manufacturer + '_' + Device.model,
        'deviceType': Device.platform,
        'userIp': this.userIp
      }
    }
  }

  getCurrentTime(): string {
    return this.datePipe.transform(new Date, 'yyyy/MM/dd HH:mm:ss');
  }

}

export interface CommonResponse {
  header: {
    // 1200
    code: string,
    // 2020/07/27 10:29:47
    txTime: string
  }
  body: any
}
