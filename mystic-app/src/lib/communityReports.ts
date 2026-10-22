// Shared by the Community Board client and server so both apply the same report rules.
export const REPORT_REASONS = [
  { id: "spam", label: "Spam or advertising" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "sexual", label: "Sexual or explicit content" },
  { id: "violence", label: "Violence or threats" },
  { id: "scam", label: "Scam or fraud" },
  { id: "misinformation", label: "False or misleading information" },
  { id: "other", label: "Something else" }
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_DETAILS_MAX = 500;
export const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "New", reviewing: "Under Review", resolved: "Resolved", dismissed: "Dismissed"
};
export const reportStatusLabel = (status: string) => Object.hasOwn(REPORT_STATUS_LABELS, status) ? REPORT_STATUS_LABELS[status] : `Unknown (${status})`;
export const REPORT_TRANSITIONS: Record<string, readonly string[]> = {
  open: ["reviewing", "dismissed"],
  reviewing: ["open", "resolved", "dismissed"],
  resolved: ["open", "reviewing"],
  dismissed: ["open", "reviewing"]
};

export type AdminReport = {
  id: string; postId: string; replyId: string | null; targetType: string;
  reporterUid: string; targetAuthorUid: string | null; reason: string; details: string;
  status: string; createdAt: string | null; reviewedAt: string | null; reviewedBy: string | null;
};
export type ReportReviewEvent = { id: string; actor: string | null; fromStatus: string; status: string; createdAt: string | null };
export type AdminReportDetail = { report: AdminReport; history: ReportReviewEvent[]; nextCursor: string | null };

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && REPORT_REASONS.some((reason) => reason.id === value);
}

export type ValidReportInput = { postId: string; replyId?: string; reason: ReportReason; details: string };

// Returns the normalized report or an error message. "Something else" needs details so moderators know what to review.
export function validateReportInput(body: unknown): { ok: true; value: ValidReportInput } | { ok: false; error: string } {
  const { postId, replyId, reason, details } = (body ?? {}) as Record<string, unknown>;
  if (typeof postId !== "string" || !SAFE_ID.test(postId) || (replyId !== undefined && (typeof replyId !== "string" || !SAFE_ID.test(replyId)))) {
    return { ok: false, error: "A valid post is required." };
  }
  if (!isReportReason(reason)) return { ok: false, error: "Choose a reason for your report." };
  if (details !== undefined && typeof details !== "string") return { ok: false, error: "Report details must be text." };
  const trimmed = (details ?? "").trim();
  if (trimmed.length > REPORT_DETAILS_MAX) return { ok: false, error: `Report details must be ${REPORT_DETAILS_MAX} characters or fewer.` };
  if (reason === "other" && !trimmed) return { ok: false, error: "Please describe the problem when choosing \"Something else\"." };
  return { ok: true, value: { postId, ...(replyId ? { replyId } : {}), reason, details: trimmed } };
}

// One report per member per post or reply; the separator cannot appear in Firestore IDs.
export function reportKeySource(reporterUid: string, postId: string, replyId?: string) {
  return `${reporterUid}\0${postId}\0${replyId ?? ""}`;
}
