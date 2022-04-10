/**
 * Count Down TimerUtils
 */
export class TimerUtils {

    private static instance: TimerUtils;

    private logoutTimer: BackgroundTimer;

    private pageTimer: BackgroundTimer;

    private componentTimer: BackgroundTimer;

    private constructor() {}

    static getInstance(): TimerUtils {
        if (TimerUtils.instance == null) {
            TimerUtils.instance = new TimerUtils();
        }
        return TimerUtils.instance;
    }

    startLogoutTimer(countSec: number, callback: (second: number) => void) {
        this.cancelLogoutTimer();

        this.logoutTimer = new BackgroundTimer(countSec, (second) => {
            if (second < 0) {
                second = 0;
            }
            callback(second);

            if (second == 0) {
                this.cancelLogoutTimer();
            }
        });

        this.logoutTimer.start();
    }

    resetLogoutTimer(callback: () => void) {
        if (this.logoutTimer != null) {
            this.logoutTimer.reset();
            callback();
        }
    }

    cancelLogoutTimer() {
        if (this.logoutTimer != null) {
            this.logoutTimer.cancel();
            this.logoutTimer = null;
        }
    }

    startPageTimer(countSec: number, callback: (second: number) => void): void {

        this.cancelPageTimer();

        this.pageTimer = new BackgroundTimer(countSec, (second) => {
            if (second < 0) {
                second = 0;
            }
            callback(second);

            if (second == 0) {
                this.cancelPageTimer();
            }
        });

        this.pageTimer.start();
    }

    resetPageTimer() {
        if (this.pageTimer != null) {
            this.pageTimer.reset();
        }
    }

    cancelPageTimer() {
        if (this.pageTimer != null) {
            this.pageTimer.cancel();
            this.pageTimer = null;
        }
    }

    startComponentTimer(countSec: number, callback: (second: number) => void): void {
        // 先終止已存在的timer
        this.cancelComponentTimer();

        this.componentTimer = new BackgroundTimer(countSec, (second) => {
            if (second < 0) {
                second = 0;
            }
            callback(second);

            if (second == 0) {
                this.cancelComponentTimer();
            }
        });

        this.componentTimer.start();
    }

    resetComponentTimer() {
        if (this.componentTimer != null) {
            this.componentTimer.reset();
        }
    }

    cancelComponentTimer() {
        if (this.componentTimer != null) {
            this.componentTimer.cancel();
            this.componentTimer = null;
        }
    }
}

class BackgroundTimer {

    interval: number;
    tickInterval: number;
    tickCallback: (num: number) => void;
    tickingEnabled: boolean;
    running: boolean;
    hasExecCallback: boolean;
    expirationDate: number;
    tickerID;

    constructor(totalCountdownSec: number, everySecCallback: (second: number) => void) {
        this.interval = totalCountdownSec * 1000;
        this.tickInterval = 1000;
        this.tickCallback = everySecCallback;
        this.tickingEnabled = everySecCallback ? true : false;
        this.running = false;
        this.hasExecCallback = false;
    }

    start() {
        this.expirationDate = new Date().getTime() + this.interval;
        if (this.tickingEnabled) {
            this.startTicking();
        } else {
            return;
        }
        return this.running = true;
    }

    reset() {
        this.expirationDate = new Date().getTime() + this.interval;
    }

    getRemaining() {
        return this.expirationDate - new Date().getTime();
    }

    resume() {
        if (this.running) {
            this.cancel();
            const b = this.getRemaining();
            if (b > 0) {
                this.running = true; this.startTicking(); return;
            } else {
                if (!this.hasExecCallback) {
                    this.hasExecCallback = true; this.tickCallback(0);
                }
                return;
            }
        } else { this.pauseTicking(); }
    }

    pauseTicking() {
        if (this.tickerID) {
            clearInterval(this.tickerID);
            return this.tickerID = null;
        }
    }

    startTicking() {
        if (this.tickingEnabled) {
            this.pauseTicking();
            return this.tickerID = setInterval(((b) => {
                return () => {
                    if (b.running) {
                        const d = b.getRemaining();
                        if (d <= 0) {
                            b.running = false; b.pauseTicking();
                            if (!b.hasExecCallback) {
                                b.hasExecCallback = true;
                                b.tickCallback(0)
                            }
                        } else {
                            let c = Math.floor((b.getRemaining() + 100) / 1000);
                            if (c == 0) {
                                b.running = false; b.pauseTicking();
                                if (!b.hasExecCallback) {
                                    b.hasExecCallback = true;
                                    b.tickCallback(0);
                                }
                            } else { b.tickCallback(c); }
                        }
                    } else { b.pauseTicking(); }
                };
            })(this), this.tickInterval);
        }
    }

    cancel() {
        if (this.running) {
            this.running = false;
            this.pauseTicking();
        }
    }

}
