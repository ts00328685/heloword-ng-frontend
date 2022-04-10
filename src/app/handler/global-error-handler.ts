import { ErrorHandler, Injectable } from '@angular/core';
import { ViewService } from '../shared/services/view.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {

  constructor(private viewService: ViewService) {}

  handleError(error) {
    console.error('global error', error);
    this.viewService.showSystemErrorToast();
    this.viewService.dismissLoading();
  }

}