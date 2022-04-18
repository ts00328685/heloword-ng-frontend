import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';
import { BaseService } from '../base/base.service';
import { map, mergeMap, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ApiService extends BaseService {

  constructor(private httpClient: HttpClient) {
    super();
    window['apiService'] = this;
  }

  doGet(url: string, params: HttpParams = new HttpParams()): Observable<CommonResponse> {
    return this.getHttpClient().pipe(
      mergeMap(httpClient => httpClient.get<CommonResponse>(environment.backendBaseUrl + url, { params: params }))
    );
  }

  doPost(url: string, params: any = {}, baseUrl = environment.backendBaseUrl): Observable<CommonResponse> {
    return this.getHttpClient().pipe(
      mergeMap(httpClient => httpClient.post<CommonResponse>(baseUrl + url, params)),
    );
  }

  getHttpClient(): Observable<HttpClient> {
    if (!environment.userIp) {
      return this.retrieveUserIp().pipe(
        map(_ => this.httpClient)
      );
    }
    return new Observable(observer => observer.next(this.httpClient));
  }

  retrieveUserIp(): Observable<any> {
    return this.httpClient.jsonp(environment.retrieveIpUrl, 'callback')
      .pipe(
        tap((rs: any) => {
          environment.userIp = rs.ip || environment.userIp;
          super.debug('clientIp:', environment.userIp);
        })
      );
  }
}

export interface CommonResponse {
  timestamp: Date
  code: string
  message: string
  data: any
}
