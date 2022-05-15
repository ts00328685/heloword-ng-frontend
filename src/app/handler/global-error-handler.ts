import { ErrorHandler, Injectable } from '@angular/core';
import { BaseComponent } from '../shared/base/base.component';
import { ViewService } from '../shared/services/view.service';

@Injectable()
export class GlobalErrorHandler extends BaseComponent implements ErrorHandler {

  constructor(private viewService: ViewService) { super(); }

  handleError(error) {
    super.error('global error', error);
    this.viewService.showSystemErrorToast();
    this.viewService.dismissLoading().then();
  }

}