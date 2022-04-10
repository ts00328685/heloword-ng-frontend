import { LoggerUtils } from '../utils/logger-utils';

export class BaseService {

    protected getClassName(): string {
        return this.constructor.name;
    }

    protected debug(...logs: any[]): void {
        LoggerUtils.debug(this.getClassName(), ...logs);
    }

    protected info(...logs: any[]): void {
        LoggerUtils.info(this.getClassName(), ...logs);
    }

    protected warn(...logs: any[]): void {
        LoggerUtils.warn(this.getClassName(), ...logs);
    }

    protected error(...logs: any[]): void {
        LoggerUtils.error(this.getClassName(), ...logs);
    }

    protected fatal(...logs: any[]): void {
        LoggerUtils.fatal(this.getClassName(), ...logs);
    }

}
