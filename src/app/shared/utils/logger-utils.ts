import { environment } from 'src/environments/environment';

export class LoggerUtils<T> {

    static loggerSettings = environment.loggerSettings;

    private static loggerType = {
        INFO: 5,
        WARN: 4,
        DEBUG: 3,
        ERROR: 2,
        FATAL: 1
    }

    public static debug(...logs: any[]): void {
        if (LoggerUtils.isDebug()) {
            if (LoggerUtils.loggerSettings.enableClientLog) {
                console.log('%c DEBUG: ', 'background: blue;color:white', ...logs);
            }
        }
    }

    public static info(...logs: any[]): void {
        if (LoggerUtils.isInfo()) {
            if (LoggerUtils.loggerSettings.enableClientLog) {
                console.log('%c INFO: ', 'background: green;color:white', ...logs);
            }
        }
    }

    public static warn(...logs: any[]): void {
        if (LoggerUtils.isWarn()) {
            if (LoggerUtils.loggerSettings.enableClientLog) {
                console.log('%c WARN: ', 'background: deeppink;color:white', ...logs);
            }
        }
    }

    public static error(...logs: any[]): void {
        if (LoggerUtils.isError()) {
            if (LoggerUtils.loggerSettings.enableClientLog) {
                console.log('%c ERROR: ', 'background: red;color:white', ...logs);
            }
        }
    }


    public static fatal(...logs: any[]): void {
        if (LoggerUtils.isFatal()) {
            if (LoggerUtils.loggerSettings.enableClientLog) {
                console.log('%c FATAL: ', 'background: red;color:white', ...logs);
            }
        }
    }

    public static isDebug(): boolean {
        if (LoggerUtils.loggerSettings.loggerLevel <= LoggerUtils.loggerType.DEBUG) {
            return true;
        }
        return false;
    }

    public static isInfo(): boolean {
        if (LoggerUtils.loggerSettings.loggerLevel <= LoggerUtils.loggerType.INFO) {
            return true;
        }
        return false;
    }

    public static isWarn(): boolean {
        if (LoggerUtils.loggerSettings.loggerLevel <= LoggerUtils.loggerType.WARN) {
            return true;
        }
        return false;
    }

    public static isError(): boolean {
        if (LoggerUtils.loggerSettings.loggerLevel <= LoggerUtils.loggerType.ERROR) {
            return true;
        }
        return false;
    }

    public static isFatal(): boolean {
        if (LoggerUtils.loggerSettings.loggerLevel <= LoggerUtils.loggerType.FATAL) {
            return true;
        }
        return false;
    }

}
