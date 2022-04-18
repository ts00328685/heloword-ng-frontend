import { Injectable } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { BaseService } from '../base/base.service';

@Injectable({
  providedIn: 'root'
})
export class ViewService extends BaseService {

  loading: HTMLIonLoadingElement;

  constructor(
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) 
  {
    super();
  }

  scrollToTop() {
    super.debug('to be implemented');
  }

  showSystemErrorToast() {
    setTimeout(() => {
      this.toastController.create({
        message: 'System busy, please try later',
        icon: 'information-circle',
        duration: 2000,
        position: 'top',
      }).then(_toast => _toast.present());
    }, 500);
  }

  async presentLoading(config = { duration: 3500 }) {
    const showLoader = async () => {
      this.loading = await this.loadingController.create(config);
      await this.loading.present();
    }

    if (this.loading) {
      this.loading.dismiss().then(_=> {
        showLoader();
      })
      return;
    }
    showLoader();
  }

  async dismissLoading() {
    if (!this.loading) {
      return;
    }

    await this.loading.dismiss();
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
