import { HttpErrorResponse, HttpEvent, HttpHandler, HttpHeaders, HttpInterceptor, HttpRequest, HttpResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { UtilsService } from "../shared/services/utils.service";
import { ViewService } from "../shared/services/view.service";

@Injectable()
export class GlobalHttpInterceptor implements HttpInterceptor {

  constructor(
    private viewService: ViewService,
    private utils: UtilsService
  ) { }

  public intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    this.viewService.presentLoading();
    const authReq = req.clone({
      headers: new HttpHeaders({
        cv: this.utils.generateCV(),
        'Authorization': 'Bearer /'
      }),
      withCredentials: true
    });
    console.log('intercepting request', authReq);
    return next.handle(authReq).pipe(
        tap(evt => {
            if (evt instanceof HttpResponse || evt instanceof HttpErrorResponse) {
                console.log('intercepting response', evt);
                this.viewService.dismissLoading();
            }
        })
    );
  }
}