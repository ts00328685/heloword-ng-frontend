import { Component } from '@angular/core';
import { BasePage } from 'src/app/shared/base/base.page';
import { Forms } from 'src/app/shared/base/validation/forms';


@Component({
  selector: 'hw-info-general',
  templateUrl: './hw-info-general.page.html',
  styleUrls: ['./hw-info-general.page.scss'],
})
export class HwInfoGeneralPage extends BasePage<any> {

  url = super.getDomSanitizer().bypassSecurityTrustResourceUrl('https://www.linkedin.com/in/ryan-tseng-4161ab83');
  curveWiki = super.getDomSanitizer().bypassSecurityTrustResourceUrl('https://en.wikipedia.org/wiki/Forgetting_curve');

  init(): void {
    
  }
  
  afterViewInit(): void {
    const script = document.createElement('script');
    script.src = 'https://platform.linkedin.com/badges/js/profile.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }

  getFormClazz(): Forms<any> {
    return null;
  }

  getPageName(): string {
    return 'Information';
  }

}
