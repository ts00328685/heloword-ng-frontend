export class RuleUtils {

    private static instance: RuleUtils;

    private constructor() { }

    static getInstance(): RuleUtils {
        if (RuleUtils.instance == null) {
            RuleUtils.instance = new RuleUtils();
        }
        return RuleUtils.instance;
    }

    isNull(obj: any): boolean {
        if (obj === undefined || obj === null) {
            return true;
        }
        return false;
    }

    isBlank(str: string): boolean {
        if (str === undefined || str === null || String(str).trim() === '') {
            return true;
        }
        return false;
    }

    isNotBlank(str: string): boolean {
        return !this.isBlank(str);
    }

    isEmptyObject(obj: {}): boolean {
        if (this.isNull(obj)) {
            return true;
        }
        for (let prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                return false;
            }
        }
        return true;
    }

    isEmptyArray(obj: any[]): boolean {
        if (this.isNull(obj)) {
            return true;
        }

        if (Array.isArray(obj) && obj.length == 0) {
            return true;
        }

        return false;
    }

    minLength(value: string, length: number) {
        if (value == null) {
            return false;
        }

        if (length < 0) {
            length = 0;
        }

        value = String(value).trim();

        if (value.length < length) {
            return false;
        }
        return true;
    }

    maxLength(value: string, length: number) {
        if (value == null) {
            return false;
        }

        if (length < 0) {
            length = 0;
        }

        value = String(value).trim();

        if (value.length > length) {
            return false;
        }
        return true;
    }

    isEmail(value: string) {
        if (value == null) {
            return false;
        }

        let emailRegExp = new RegExp('^[\\w-]+([\\.+][\\w-]+)*@[\\w-]+(\\.[\\w-]+)+$');
        if (emailRegExp.exec(value) == null) {
            return false;
        }
        return true;
    }

    /**
     * 是否含有全形字
     * 'ab全c': true
     */
    hasFullwidth(str: string): boolean {
        if (this.isNull(str)) {
            return false;
        }
        return /[^\x00-\xff]+/.test(str);
    }

    /**
     * isEnglish('abc'), return true
     */
    isEnglish(str: string): boolean {
        if (this.isNull(str)) {
            return false;
        }
        for (let i = 0; i < str.length; i++) {
            let s = String.fromCharCode(str.charCodeAt(i));
            if (!/^[a-zA-Z]*$/.test(s)) {
                return false;
            }
        }
        return true;
    }

    /**
     * isNumber('123'), return true
     */
    isNumber(str: string): boolean {
        if (this.isNull(str)) {
            return false;
        }
        for (let i = 0; i < str.length; i++) {
            let s = String.fromCharCode(str.charCodeAt(i));
            if (!/^[0-9]*$/.test(s)) {
                return false;
            }
        }
        return true;
    }

    isNumeric(value: string | number): boolean {
        if (value == null || value === '') {
            return false;
        }
        // 不是NaN,就為number
        return !isNaN(Number(value.toString()));
    }

    isNotNumeric(value) {
        value = typeof value === 'string' ? value : String(value);
        return !this.isNumeric(value);
    }

    isEngAndNumber(value: string): boolean {
        if (this.isNull(value)) {
            return false;
        }

        value = value.toUpperCase();

        if ((/^[0-9A-Z]+$/.test(value))) {
            return true;
        }
        return false;
    }

    /**
     * '000':true
     * '123':false
     */
    checkSameNumber(str: string): boolean {

        if (this.isNull(str)) {
            return false;
        }

        let length = str.length;
        let count = 1;
        for (let i = 0; i < str.length - 1; i++) {
            let c = str.charAt(i);
            if (c > '9' || c < '0') {
                count = 1;
            } else if (c == str.charAt(i + 1)) {
                count++;
            } else {
                count = 1;
            }
        }

        if (length <= count) {
            return true;
        }
        return false;
    }

    /**
     * 'aaa':true
     * 'aab':false
     */
    isSameAlphabet(str: string): boolean {

        if (this.isNull(str)) {
            return false;
        }

        str = str.toUpperCase();
        let length = str.length;
        let count = 1;
        for (let i = 0; i < str.length - 1; i++) {
            let c = str.charAt(i);
            if (c > 'Z' || c < 'A') {
                count = 1;
            } else if (c == str.charAt(i + 1)) {
                count++;
            } else {
                count = 1;
            }
        }

        if (length <= count) {
            return true;
        }
        return false;
    }

    /**
     * 'abc':true
     * 'cba':false
     */
    checkConsecutiveAsc(str: string): boolean {
        if (this.isNull(str)) {
            return false;
        }
        str = str.toUpperCase();
        let continuous = true;
        let c = str.charCodeAt(0);
        for (let i = 1; i < str.length; i++) {
            if (str.charCodeAt(i) != (c + 1)) {
                continuous = false;
                break;
            }
            else {
                c = str.charCodeAt(i);
            }
        }
        return continuous;
    }

    /**
     * 'cba':true
     * 'abc':false
     */
    checkConsecutiveDesc(str: string): boolean {
        if (this.isNull(str)) {
            return false;
        }
        str = str.toUpperCase();
        let continuous = true;
        let c = str.charCodeAt(0);
        for (let i = 1; i < str.length; i++) {
            if (str.charCodeAt(i) != (c - 1)) {
                continuous = false;
                break;
            }
            else {
                c = str.charCodeAt(i);
            }
        }
        return continuous;
    }

    isInteger(number) {
        const reg = /^-?\d+$/;
        return number && reg.test(number);
    }

    isNotInteger(number) {
        return !this.isInteger(number);
    }

    isPositiveInteger(number) {
        const reg = /^[0-9]*[1-9][0-9]*$/;
        return number && reg.test(number);
    }

    isNotNegativeInteger(number) {
        const reg = /^\d+$/;
        return number && reg.test(number);
    }

    isNotPositiveInteger(number) {
        return !this.isPositiveInteger(number);
    }

    isIntegerOrFloat(number) {
        if (!this.isInteger(number)) {
            const reg = /^-?\d+\.\d*$/;
            return number && reg.test(number);
        }
        return true;
    }

    hasDecimal(number) {
        return String(number).indexOf('.') > -1;
    }

    isSacleMoreThan(number, scale: number) {
        var arFloat = ('' + number).split('.');
        return arFloat.length > 1 && arFloat[1].length > scale;
    }

    validateLength(number, intLength, scaleLength) {
        let str = '' + number;
        let strArr = str.split('.');

        if (strArr.length === 2) {
            if (strArr[0].length > intLength || strArr[1].length > scaleLength) {
                return false;
            }
        } else if (strArr.length === 1) {
            if (strArr[0].length > intLength) {
                return false;
            }
        }

        return true;
    }

    isPreSixLettersEquals(input1: string, input2: string) {
        let isEqual = false;
        if (input1 !== '' && input2 !== '') {
            if (input1.length >= 6 && input2.length >= 6) {
                if (input1.substring(0, 6).toUpperCase() === input2.substring(0, 6).toUpperCase()) {
                    isEqual = true;
                }
            }
        }
        return isEqual;
    }

    isNegative(number): boolean {
        return Number(number) < 0;
    }

    isBeforeNMonth(date, sysDate: Date, NMonth: number, canEqualToday?: boolean): boolean {
        if (this.isNull(date)) {
            return false;
        }

        let cDate = sysDate;
        let fill = (NMonth == 0) ? 0 : 1; // 若NMonth為0，要跟系統日比較，如果帶入1會變成系統日前一天
        let nMonthDate = new Date(cDate.getFullYear(), cDate.getMonth() - NMonth, cDate.getDate() - fill);

        if (canEqualToday) {
            return date.getTime() >= nMonthDate.getTime();
        } else {
            return date.getTime() > nMonthDate.getTime();
        }
    }

    isAfterNMonth(date, sysDate: Date, NMonth: number, canEqualToday?: boolean): boolean {
        if (this.isNull(date)) {
            return false;
        }

        let cDate = sysDate;
        let fill = (NMonth == 0) ? 0 : 1; // 若NMonth為0，要跟系統日比較，如果帶入1會變成系統日後一天
        let nMonthDate = new Date(cDate.getFullYear(), cDate.getMonth() + NMonth, cDate.getDate() + fill);

        if (canEqualToday) {
            return date.getTime() <= nMonthDate.getTime();
        } else {
            return date.getTime() < nMonthDate.getTime();
        }
    }

    isStartLaterThanEnd(startDate, endDate, startCanEqualEnd?: boolean): boolean {
        if (this.isNull(startDate) || this.isNull(endDate)) {
            return false;
        }

        if (startCanEqualEnd) {
            return startDate.getTime() > endDate.getTime();
        } else {
            return startDate.getTime() >= endDate.getTime();
        }
    }

    isIntervalTooLong(startDate, endDate, NMonth: number): boolean {
        if (this.isNull(startDate) || this.isNull(endDate)) {
            return false;
        }

        let NMonthFromStartDate =
            new Date(startDate.getFullYear(), startDate.getMonth() + NMonth, startDate.getDate());

        return endDate.getTime() > NMonthFromStartDate.getTime();
    }

    isIntervalTooLongYears(startDate, endDate, NYear: number): boolean {
        if (this.isNull(startDate) || this.isNull(endDate)) {
            return false;
        }

        let NYearFromStartDate =
            new Date(startDate.getFullYear() + NYear, startDate.getMonth(), startDate.getDate());

        return endDate.getTime() > NYearFromStartDate.getTime();
    }

    isDateStr(dateStr: string): boolean {
        if (this.isBlank(dateStr)) {
            return false;
        }
        if (!this.isNumber(dateStr)) {
            return false;
        }

        let formatDate = '';
        if (dateStr.length == 7) { // 民國年(需轉換成西元年)
            let year = (Number(dateStr.substr(0, 3)) + 1911).toString();
            formatDate = year + dateStr.substr(3, 2) + dateStr.substr(5, 2);
        }
        else if (dateStr.length == 8) { // 西元年
            formatDate = dateStr;
        }
        else {
            return false;
        }

        const year = parseInt(formatDate.substring(0, 4), 10);
        const month = parseInt(formatDate.substring(4, 6), 10) - 1;
        const day = parseInt(formatDate.substring(6), 10);

        // Check the ranges of month and year
        if (year < 1000 || year > 3000 || month < 0 || month > 12) {
            return false;
        }

        const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        // Adjust for leap years
        if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
            monthLength[1] = 29;
        }

        // Check the range of the day
        return day > 0 && day <= monthLength[month];
    }

    isCeDateStr(dateStr: string): boolean {
        let reg = /^((19|20)?[0-9]{2}[- /.](0?[1-9]|1[012])[- /.](0[1-9]|[12][0-9]|3[01]))*$/;

        let isFirstCheckPass = reg.test(dateStr);

        if (!isFirstCheckPass) {
            return false;
        }

        let yearStr = dateStr.substring(0, dateStr.indexOf('/'));
        let monStr = dateStr.substring(dateStr.indexOf('/') + 1, dateStr.lastIndexOf('/'));
        let dayStr = dateStr.substring(dateStr.lastIndexOf('/') + 1, dateStr.length);

        if (monStr.length < 2) {
            monStr = '0' + monStr;
        }
        if (dayStr.length < 2) {
            dayStr = '0' + dayStr;
        }

        return this.isDateStr(yearStr + monStr + dayStr);
    }

    isNotCeDateStr(dateStr: string) {
        return !this.isCeDateStr(dateStr);
    }

    isInputDateAfterNMonth(currentDate: Date, inputDate: Date, intervalMonth: number): boolean {
        let cDate = currentDate;
        let nMonthDate = new Date(cDate.getFullYear(), cDate.getMonth() - intervalMonth, cDate.getDate() - 1);

        return inputDate.getTime() > nMonthDate.getTime();
    }

    isInputDateBeforeNMonth(currentDate: Date, inputDate: Date, intervalMonth: number): boolean {
        let cDate = currentDate;
        let nMonthDate = new Date(cDate.getFullYear(), cDate.getMonth() + intervalMonth, cDate.getDate() + 1);
        return inputDate.getTime() < nMonthDate.getTime();
    }

    compareSeqCharEquals(target: string, value: string, compareLen: number) {

        if (!this.isBlank(target) && !this.isBlank(value) && compareLen >= 0 &&
            target.length >= compareLen && value.length >= compareLen) {

            let targetIsLonger: boolean = target.length > value.length;
            var longOne: string = targetIsLonger ? target.toLocaleUpperCase() : value.toLocaleUpperCase();
            var compared = targetIsLonger ? value.toLocaleUpperCase() : target.toLocaleUpperCase();

            for (var i = 0; i <= longOne.length - compareLen; i++) {
                var searchStr = longOne.substring(i, i + compareLen);
                if (compared.indexOf(searchStr) > -1) {
                    return true;
                }
            }
        }

        return false;
    }

    checkConsecutiveByLength(target: string, compareLen: number) {

        if (!this.isBlank(target) && compareLen >= 0 && target.length >= compareLen) {
            const compareStr = '01234567890';
            let tempTarget = target;
            for (var i = 0; i <= tempTarget.length - compareLen; i++) {
                var searchStr = tempTarget.substring(i, i + compareLen);
                if (this.checkConsecutiveAsc(searchStr) || this.checkConsecutiveDesc(searchStr) || compareStr.indexOf(searchStr) > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    checkSameAlphaOrNumber(target: string, compareLen: number) {

        if (!this.isBlank(target) && compareLen >= 0 && target.length >= compareLen) {
            let tempTarget = target;
            for (var i = 0; i <= tempTarget.length - compareLen; i++) {
                var searchStr = tempTarget.substring(i, i + compareLen);
                if (this.checkSameNumber(searchStr) || this.isSameAlphabet(searchStr)) {
                    return true;
                }
            }
        }

        return false;
    }

}
