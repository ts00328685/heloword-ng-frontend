import { Injectable } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { BaseService } from '../base/base.service';

@Injectable({
  providedIn: 'root'
})
export class ViewService extends BaseService {

  loading: HTMLIonLoadingElement;
  lastLoaderTime: number;

  constructor(
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
  ) {
    super();
  }

  scrollToTop() {
    super.debug('to be implemented');
  }

  showSystemErrorToast() {
    setTimeout(() => {
      this.showToast('System busy, please try later');
    }, 500);
  }

  showToast(msg = '', duration = 2000, position: 'top' | 'bottom' = 'top', icon = 'information-circle') {
    this.toastController.create({
      message: msg,
      icon,
      duration,
      position,
    }).then(_toast => _toast.present());
  }

  async presentLoading(config = { duration: 35000 }) {
    const showLoader = async () => {
      this.loading = await this.loadingController.create(config);
      this.lastLoaderTime = new Date().getTime();
      await this.loading.present();
    }

    if (this.loading) {
      this.loading.dismiss().then(_ => {
        showLoader();
      })
      return;
    }
    await showLoader();
  }

  async dismissLoading() {
    if (!this.loading) {
      return;
    }

    await this.loading.dismiss();
    const topLayer = await this.loadingController.getTop();
    if (topLayer) {
      await topLayer.dismiss();
    }
  }

  showAlert(message: string, cssClass = '', header = 'Notification', buttonText = 'Okay') {
    this.createAlert(message, cssClass, header, buttonText).then(alert => alert.present().then());
  }

  createAlert(message: string, cssClass = '', header = 'Notification', buttonText = 'Okay'): Promise<HTMLIonAlertElement> {
    return this.alertController.create({
      cssClass,
      header,
      message,
      buttons: [buttonText]
    });
  }

}
