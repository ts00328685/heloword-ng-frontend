export interface Sentence extends Word {
    sentence: string;
    sentences: Sentence[];
}
export interface Word {
    id: number;
    createDate?: any;
    updateDate?: any;
    createBy?: any;
    status: number;
    version?: any;
    word: string;
    translateEn: string;
    translateCh: string;
    level?: any;
    tag?: any;
    type?: any;
    note?: any;
    info?: any;
    language: string;
    tableName?: string;
}
