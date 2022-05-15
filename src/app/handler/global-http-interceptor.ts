import { DatePipe } from "@angular/common";
import { HttpEvent, HttpHandler, HttpHeaders, HttpInterceptor, HttpRequest, HttpResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { from, Observable, of } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { environment } from "src/environments/environment";
import { UtilsService } from "../shared/services/utils.service";
import { ViewService } from "../shared/services/view.service";
import { BaseComponent } from "../shared/base/base.component";

@Injectable({
  providedIn: 'root'
})
export class GlobalHttpInterceptor extends BaseComponent implements HttpInterceptor {

  lastResponseTimestamp: number;

  constructor(
    private datePipe: DatePipe,
    private viewService: ViewService,
    private utils: UtilsService
  ) {
    super();
  }

  public intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const loader = from(this.viewService.presentLoading());

    const withCredentials = req.url !== environment.retrieveIpUrl;

    const authReq = req.clone({
      headers: new HttpHeaders(this.getCommonHeader()),
      withCredentials
    });
    super.debug('intercepting request', authReq);
    return next.handle(authReq).pipe(
      mergeMap(evt => loader.pipe(l => of(evt))),
      catchError(this.handleHttpError.bind(this)),
      mergeMap(evt => {
        if (!(evt instanceof HttpResponse)) {
          return of(evt);
        }

        this.lastResponseTimestamp = new Date().getTime();
        super.debug('intercepting response', evt, this.viewService.lastLoaderTime);
        if (this.lastResponseTimestamp > this.viewService.lastLoaderTime) {
          return from(this.viewService.dismissLoading()).pipe(mergeMap(_ => of(evt)));
        }

        return of(evt);
      })
    );
  }

  handleHttpError(error: any): Observable<any> {
    this.viewService.dismissLoading().then();
    this.viewService.showSystemErrorToast();
    super.error('handling http error', error);
    return of({
      body: { code: '1999', message: error, timestamps: new Date() }
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