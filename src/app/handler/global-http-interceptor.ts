import { DatePipe } from "@angular/common";
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpHeaders, HttpInterceptor, HttpRequest, HttpResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { environment } from "src/environments/environment";
import { UtilsService } from "../shared/services/utils.service";
import { ViewService } from "../shared/services/view.service";
import { BaseComponent } from "../shared/base/base.component";

@Injectable({
  providedIn: 'root'
})
export class GlobalHttpInterceptor extends BaseComponent implements HttpInterceptor {

  constructor(
    private datePipe: DatePipe, 
    private viewService: ViewService,
    private utils: UtilsService
  ) {
    super();
    window['interceptor'] = this;
   }

  public intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    this.viewService.presentLoading();

    const withCredentials = req.url !== environment.retrieveIpUrl;

    const authReq = req.clone({
      headers: new HttpHeaders(this.getCommonHeader()),
      withCredentials
    });
    super.debug('intercepting request', authReq);
    return next.handle(authReq).pipe(
        catchError(this.handleHttpError.bind(this)),
        tap(evt => {
            if (evt instanceof HttpResponse) {
                super.debug('intercepting response', evt);
                this.viewService.dismissLoading().then();
            }
        })
    );
  }

  handleHttpError(error: any): Observable<any> {
    this.viewService.dismissLoading();
    this.viewService.showSystemErrorToast();
    super.error('handling http error', error);
    return of({
      body: { code: '1999', message:  error, timestamps: new Date()}
    });
  }

  getCommonHeader() {
    return {
        'cv': this.utils.generateCV(environment.cipher.aesKey, environment.cipher.aesIv),
        'X-REQUEST-ID': this.utils.generateUUID(),
        'Authorization': 'Bearer /',
        'ChannelCode': 'NG-FRONTEND',
        'ClientIp': environment.userIp
    }
  }
  
  getCurrentTime(): string {
    return this.datePipe.transform(new Date, 'yyyy/MM/dd HH:mm:ss');
  }
}