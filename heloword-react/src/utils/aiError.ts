import i18n from '../i18n';
import { AI_BUSY, AI_INVALID_INPUT, AI_QUOTA_EXCEEDED } from '../services/llm.service';

/** True for errors that shouldn't offer a retry button (retrying won't help). */
export function isAiLimitError(e: unknown): boolean {
  const msg = (e as Error)?.message;
  return msg === AI_QUOTA_EXCEEDED || msg === AI_INVALID_INPUT;
}

/** User-facing message for an AI call failure. */
export function aiErrorMessage(e: unknown, isLoggedIn: boolean): string {
  switch ((e as Error)?.message) {
    case AI_QUOTA_EXCEEDED:
      return i18n.t(isLoggedIn ? 'llm.quotaExceededMember' : 'llm.quotaExceeded');
    case AI_BUSY:
      return i18n.t('llm.busy');
    case AI_INVALID_INPUT:
      return i18n.t('llm.invalidInput');
    default:
      return i18n.t('llm.error');
  }
}
