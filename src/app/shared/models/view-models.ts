export class ModalConfig implements IModalConfig {
    isDisplay = false;
    isConfirmBtnDisplay = true;
    isCancelBtnDisplay = false;
    isCloseBtnDisplay = true;
    isBtnReversed = false;
    title = '';
    content = '';
    confirmBtnText = '確認';
    cancelBtnText = '取消';
    isSystemError = false;
    onConfirm = () => { };
    onCancel = () => { };
}

export interface IModalConfig {
    isDisplay?: boolean;
    isConfirmBtnDisplay?: boolean;
    isCancelBtnDisplay?: boolean;
    isCloseBtnDisplay?: boolean;
    isBtnReversed?: boolean;
    title?: string;
    content: string;
    confirmBtnText?: string;
    cancelBtnText?: string;
    isSystemError?: boolean;
    onConfirm?: (result?: any) => void;
    onCancel?: () => void;
}
