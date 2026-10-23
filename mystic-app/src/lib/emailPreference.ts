import { auth } from "../firebase";
import type { EmailConsent } from "./emailConsent";
import { PRIVACY_VERSION, TERMS_VERSION } from "./policies";

export async function emailPreferenceRequest(choice?: { consented: boolean; onboarding?: boolean; termsAccepted?: boolean }): Promise<EmailConsent> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in to manage email preference.");
  const token = await user.getIdToken();
  const response = await fetch("/api/members/me/email-consent", {
    method: choice ? "POST" : "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(choice ? { "Content-Type": "application/json" } : {}) },
    ...(choice ? { body: JSON.stringify({ ...choice, ...(choice.onboarding ? { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION } : {}) }) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save email preference.");
  return data;
}
