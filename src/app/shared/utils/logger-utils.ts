import { environment } from 'src/environments/environment';

export class LoggerUtils<T> {

    static loggerSettings = environment.loggerSettings;

    private static loggerType: {
        INFO: 5,
        WARN: 4,
        DEBUG: 3,
        ERROR: 2,
        FATAL: 1
    }

    public static debug(...logs: any[]): void {
        if (this.isDebug()) {
            if (this.loggerSettings.enableClientLog) {
                console.log('%c DEBUG: ', 'background: blue;color:white', ...logs);
            }
        }
    }

    public static info(...logs: any[]): void {
        if (this.isInfo()) {
            if (this.loggerSettings.enableClientLog) {
                console.log('%c INFO: ', 'background: green;color:white', ...logs);
            }
        }
    }

    public static warn(...logs: any[]): void {
        if (this.isWarn()) {
            if (this.loggerSettings.enableClientLog) {
                console.log('%c WARN: ', 'background: deeppink;color:white', ...logs);
            }
        }
    }

    public static error(...logs: any[]): void {
        if (this.isError()) {
            if (this.loggerSettings.enableClientLog) {
                console.log('%c ERROR: ', 'background: red;color:white', ...logs);
            }
        }
    }


    public static fatal(...logs: any[]): void {
        if (this.isFatal()) {
            if (this.loggerSettings.enableClientLog) {
                console.log('%c FATAL: ', 'background: red;color:white', ...logs);
            }
        }
    }

    public static isDebug(): boolean {
        if (this.loggerSettings.loggerLevel <= this.loggerType.DEBUG) {
            return true;
        }
        return false;
    }

    public static isInfo(): boolean {
        if (this.loggerSettings.loggerLevel <= this.loggerType.INFO) {
            return true;
        }
        return false;
    }

    public static isWarn(): boolean {
        if (this.loggerSettings.loggerLevel <= this.loggerType.WARN) {
            return true;
        }
        return false;
    }

    public static isError(): boolean {
        if (this.loggerSettings.loggerLevel <= this.loggerType.ERROR) {
            return true;
        }
        return false;
    }

    public static isFatal(): boolean {
        if (this.loggerSettings.loggerLevel <= this.loggerType.FATAL) {
            return true;
        }
        return false;
    }

}
