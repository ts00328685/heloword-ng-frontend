import { RuleUtils } from './rules-utils';

export class CommonUtils {

    private static asciiTable = " !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
    private static big5Table = "%u3000%uFF01%u201D%uFF03%uFF04%uFF05%uFF06%u2019%uFF08%uFF09%uFF0A%uFF0B%uFF0C%uFF0D%uFF0E%uFF0F%uFF10%uFF11%uFF12%uFF13%uFF14%uFF15%uFF16%uFF17%uFF18%uFF19%uFF1A%uFF1B%uFF1C%uFF1D%uFF1E%uFF1F%uFF20%uFF21%uFF22%uFF23%uFF24%uFF25%uFF26%uFF27%uFF28%uFF29%uFF2A%uFF2B%uFF2C%uFF2D%uFF2E%uFF2F%uFF30%uFF31%uFF32%uFF33%uFF34%uFF35%uFF36%uFF37%uFF38%uFF39%uFF3A%uFF3B%uFF3C%uFF3D%uFF3E%uFF3F%u2018%uFF41%uFF42%uFF43%uFF44%uFF45%uFF46%uFF47%uFF48%uFF49%uFF4A%uFF4B%uFF4C%uFF4D%uFF4E%uFF4F%uFF50%uFF51%uFF52%uFF53%uFF54%uFF55%uFF56%uFF57%uFF58%uFF59%uFF5A%uFF5B%uFF5C%uFF5D%uFF5E";

    public static equalsIgnoreCase(str1: string, str2: string) {
        if (RuleUtils.getInstance().isNull(str1) || RuleUtils.getInstance().isNull(str2)) {
            return false;
        }
        return str1.toUpperCase() === str2.toUpperCase();
    }

    public static replaceAll(str: string, regex: string, replacement: string): string {
        if (RuleUtils.getInstance().isNull(str) || RuleUtils.getInstance().isNull(regex) || RuleUtils.getInstance().isNull(replacement)) {
            return str;
        }
        return str.replace(new RegExp(regex, 'g'), replacement);
    }

    public static trimAllBlank(s: string) {
        const s1 = this.trimLeft(s);
        return (this.trimRight(s1));
    }

    public static trimLeft(s: string) {
        s = "" + s;
        let len = s.length;
        let pos = 0;
        let s1 = "";
        let re = /\s/;
        while (pos < len) {
            let chr = s.substring(pos, pos + 1);
            if (chr.match(re)) {
                pos = pos + 1;
            }
            else {
                return (s.substring(pos, len));
            }
        }
        return s1;
    }

    public static trimRight(s: string) {
        s = "" + s;
        let len = s.length;
        let pos = len - 1;
        let s1 = "";
        let i = 0;
        let re = /\s/;
        while (pos >= 0) {
            let chr = s.substring(pos, s.length - i);
            if (chr.match(re))
                pos = pos - 1;
            else
                return (s.substring(0, pos + 1));
            i++;
        }
        return s1;
    }

    public static getRightString(str: string, len: number): string {
        return str.substring(str.length - len, str.length);
    }

    /**
     * leftPad('abc', 5, 'd'), return 'ddabc'
     */
    public static leftPad(str: string, len: number, pad?: string): string {
        if (RuleUtils.getInstance().isNull(str) || str.length >= len) {
            return str;
        }

        if (RuleUtils.getInstance().isBlank(pad)) {
            pad = '0';
        } else if (pad.length > 1) {
            pad = pad.substring(0, 1);
        }

        let paddingStr = '';
        for (let i = 0; i < len - str.length; i++) {
            paddingStr += pad;
        }
        return paddingStr + str;
    }

    /**
     * format('hello {0}', ['everyone']), return 'hello everyone'
     */
    public static format(str: string, params: string[]): string {
        if (RuleUtils.getInstance().isNull(str)) {
            return str;
        }
        for (let i = 0; i < params.length; i++) {
            str = str.replace(new RegExp("\\{" + i + "\\}", "g"), params[i]);
        }
        return str;
    }

    /**
     * format('hello {a}', {a:'everyone'}), return 'hello everyone'
     */
    public static formatByVariables(template: string, params: {}): string {
        if (RuleUtils.getInstance().isNull(template)) {
            return template;
        }
        var regexp = /{([^{]+)}/g;

        return template.replace(regexp, (ignore, key) => {
            return (key = params[key]) == null ? '' : key;
        });
    }

    /**
     * commafy
     */
    public static commafy(num: any): string {
        num = num + "";
        let integer = (num.split('.'))[0];
        let decimal = (num.split('.'))[1];
        let re = /(-?\d+)(\d{3})/;
        while (re.test(integer)) {
            integer = integer.replace(re, "$1,$2");
        }

        if (typeof decimal == 'undefined') {
            return integer;
        } else {
            return integer + '.' + decimal;
        }
    }

    /**
     * commafy number to fixed decimal
     */
    public static commafyWithFixedDecimal(val: string | number, precision: number) {
        if (RuleUtils.getInstance().isNull(val) || (typeof (val) == 'string' && RuleUtils.getInstance().isBlank(val))) {
            return '';
        }
        if (typeof (val) == 'number') {
            val = String(val);
        }

        let inputVal = (val || '').toString();
        inputVal = this.replaceAll(inputVal, ',', '');

        let numValue: Number = 0;
        if (precision === 0) {
            numValue = Number(inputVal) || 0;
        } else {
            numValue = Number.parseFloat(inputVal);
        }

        inputVal = numValue.toFixed(precision);

        return this.commafy(inputVal);
    }

    /**
     * commafy number
     */
    public static commafyAmt(amt: string, scale: number = 0) {
        return amt ? this.commafyWithFixedDecimal(amt, scale) : '';
    }

    /**
     * round integer to specific precision
     */
    public static roundDecimal(val: number, precision: number): number {
        return Math.round(Math.round(val * Math.pow(10, (precision || 0) + 1)) / 10) / Math.pow(10, (precision || 0));
    }

    /**
     * roundInteger(1234, 1); //1230
     * roundInteger(12345, 2); //12300
     * roundInteger(1234567, 3); //1234000
     * roundInteger(12345.67, 2); //12300
     */
    public static roundInteger(val: number, precision: number): number {
        const scale = Math.pow(10, precision);
        return Math.floor(val / scale) * scale;
    }

    /**
     * half to full character A -> Ａ
     */
    public static char2Chinese(text): string {
        if (/[\x00-\xff]/g.test(text)) {  //判斷是否有半形字元
            let result = "";
            for (let i = 0; i < text.length; i++) {
                let val = text.charAt(i);
                let j = this.asciiTable.indexOf(val) * 6;
                result += (j > -1 ? unescape(this.big5Table.substring(j, j + 6)) : val);
            }
            return result;
        }
        else {
            return text;
        }
    }

    /**
     * half to full character Ａ -> A
     */
    public static full2HalfStr(text: string): string {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            let c = text[i];
            if (/[\x00-\xff]/g.test(c)) {
                result += c;
            } else {
                let big5 = escape(c);
                let halfIdx = Math.floor(this.big5Table.indexOf(big5) / 6);
                if (halfIdx == -1) {
                    result += c;
                } else {
                    result += this.asciiTable[halfIdx];
                }
            }
        }
        return result;
    }

    /**
     * str2Date('2017/01/12'), return Date('2017', '1', '12')
     */
    public static str2Date(dateStr: string): Date {
        if (RuleUtils.getInstance().isBlank(dateStr)) {
            return null;
        }

        let array = [];
        array = dateStr.split('/');
        if (array.length != 3) {
            return null;
        }

        let year = parseInt(array[0].replace(/^[0]*/, ""), 10);
        let month = parseInt(array[1].replace(/^[0]*/, ""), 10) - 1;
        let day = parseInt(array[2].replace(/^[0]*/, ""), 10);
        return new Date(year, month, day);
    }

    /**
     * date2Str(Date('2017', '1', '1')), return '2017/01/01'
     */
    public static date2str(date: Date) {
        if (RuleUtils.getInstance().isNull(date)) {
            return '';
        }
        let yearStr: string = date.getFullYear().toString();
        let month = (date.getMonth() + 1);
        let monthStr = month < 10 ? '0' + month.toString() : month.toString();
        let day = date.getDate();
        let dayStr = day < 10 ? '0' + day.toString() : day.toString();
        return yearStr + "/" + monthStr + "/" + dayStr;
    }

    /**
     * date2yyyyMMdd(Date) => '2017/01/01'
     */
    public static date2yyyyMMdd(date: Date) {
        if (RuleUtils.getInstance().isNull(date)) {
            return '';
        }
        const mm = date.getMonth() + 1; // getMonth() is zero-based
        const dd = date.getDate();

        return [date.getFullYear(),
        (mm > 9 ? '' : '0') + mm,
        (dd > 9 ? '' : '0') + dd
        ].join('/');
    }

    /**
     * 取得日期時間字串 ex:20171130125601
     */
    public static getSimpleFormatDateTimeStr(d): string {
        return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ("0" + d.getSeconds()).slice(-2);
    }

    /**
     * date2strWithDelimiter(Date('2017', '1', '1'), ''), return '20170101'
     */
    public static date2strWithDelimiter(date: Date, delimiter: string): string {
        const datestr = this.date2str(date);
        return this.replaceAll(datestr, '/', delimiter);
    }

    public static clearDateTime(date: Date) {
        date.setHours(0, 0, 0, 0);
    }

    public static addDay(date: Date, intervalDays: number): Date {
        if (RuleUtils.getInstance().isNull(date)) {
            return null;
        }
        const resultDate = new Date(date.getTime());
        resultDate.setDate(resultDate.getDate() + intervalDays);
        return resultDate;
    };

    public static addMonth(date: Date, intervalMonth: number): Date {
        if (RuleUtils.getInstance().isNull(date)) {
            return null;
        }
        const resultDate = new Date(date.getTime());
        resultDate.setMonth(resultDate.getMonth() + intervalMonth);
        if (date.getDate() != resultDate.getDate()) {
            const month = (date.getMonth() + intervalMonth) % 12;
            const newDate = new Date(date.getFullYear(), month + 1, 0);
            resultDate.setMonth(0);
            resultDate.setDate(newDate.getDate());
            resultDate.setMonth(newDate.getMonth());
        }
        return resultDate;
    };


    /**
     * base64 string to blob
     * @param b64Data base64 string
     * @param contentType contentType
     * @param sliceSize sliceSize
     */
    public static b64toBlob(b64Data: string, contentType = '', sliceSize = 512): Blob {
        const byteCharacters = atob(b64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);

            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, { type: contentType });
        return blob;
    }

    public static generateFile(fileName: string, extension: string, data: Blob) {
        const href = URL.createObjectURL(data);
        const link = document.createElement('a');
        document.body.appendChild(link);
        link.href = href;
        link.download = fileName + '.' + extension;
        link.click();
    }

}
