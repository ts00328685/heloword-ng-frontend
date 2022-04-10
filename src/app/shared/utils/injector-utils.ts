import { Injector } from '@angular/core';

export class InjectorUtils {

  private static injector: Injector;

  static setInjector(injector: Injector) {
    InjectorUtils.injector = injector;
  }

  static getInjector(): Injector {
    return InjectorUtils.injector;
  }

}

