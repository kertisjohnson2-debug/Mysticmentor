export const EMAIL_CONSENT_VERSION = "2026-10-21-v1";
export const EMAIL_CONSENT_WORDING = "I agree to receive emails from Mysticmentor about updates, announcements, and offers. I can unsubscribe at any time.";

export type EmailConsent = {
  consented: boolean;
  recordedAt: string | null;
  version: string | null;
};

export type EmailConsentHistoryPage = {
  current: EmailConsent;
  history: (EmailConsent & { id: string; source: string | null; wording: string | null })[];
  nextCursor: string | null;
};

export function readEmailConsent(data?: Record<string, unknown>): EmailConsent {
  return {
    consented: data?.consented === true,
    recordedAt: typeof data?.recordedAt === "string" ? data.recordedAt : null,
    version: typeof data?.version === "string" ? data.version : null
  };
}
