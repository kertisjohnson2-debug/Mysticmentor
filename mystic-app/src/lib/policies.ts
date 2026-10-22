// Starter policy versions: owner/legal review is required before public launch.
export const TERMS_VERSION = "2026-10-21-starter-v1";
export const PRIVACY_VERSION = "2026-10-21-starter-v1";
export const POLICY_REVIEW_NOTICE = "Starter policies — owner and legal review required before public launch. This wording is not legal approval.";

export const TERMS_SECTIONS = [
  {
    title: "Using Mysticmentor / Celestial Sanctuary",
    text: "These starter Terms describe use of Mysticmentor, also presented as Celestial Sanctuary. By explicitly accepting these Terms when creating or continuing your registration, you agree to follow them. The Privacy Policy explains how account and service information is handled. Do not create an account if you do not agree. These documents require owner and legal review before public launch."
  },
  {
    title: "Accounts and security",
    text: "Provide accurate registration information, keep your sign-in credentials private, and use only accounts you are authorized to access. You are responsible for your account activity and for protecting your devices. Account and staff permissions are controlled by the service; registration does not grant administrator or reader privileges. Use the available password-reset and account-security controls when needed."
  },
  {
    title: "Tarot, astrology, and spiritual content",
    text: "Tarot, astrology, numerology, and other spiritual content are for personal reflection and entertainment. They are not professional medical, mental-health, legal, financial, or other regulated advice, and no outcome or prediction is guaranteed. Do not rely on a reading instead of qualified professional help or emergency services."
  },
  {
    title: "Profiles, community, live broadcasts, and chats",
    text: "You choose what to share in your profile, community posts, replies, chats, and live broadcasts. Other participants may see or retain content you share; do not post private information about yourself or others without permission. Public-profile settings control supported optional profile fields, not information you independently publish in posts or broadcasts. You retain responsibility for your content and permit the service to store, display, and transmit it as needed to provide the features you use."
  },
  {
    title: "Acceptable use",
    text: "Do not harass, threaten, impersonate, defraud, publish unlawful or exploitative content, infringe others' rights, expose private information, evade account restrictions, or interfere with the service. Do not misuse reports, payment features, or staff controls. Report inappropriate community content using the available reporting tools. Reports are subject to administrator review; immediate review or automated monitoring is not promised."
  },
  {
    title: "Virtual Gems, gifts, tips, and payment features",
    text: "Where available, review the displayed price and payment terms before purchasing Gems or sending a tip. Gems are virtual in-app units for supported features, not a bank balance or a promise of cash redemption. Buying or spending Gems does not guarantee reader status or a broadcaster payout. Cash tipping and connected-account onboarding use Stripe when configured, with eligibility and payment-provider requirements. These Terms do not create a refund, cash-out, subscription, or payout feature that is not available in the app. Owner review must settle applicable consumer rights, fees, and payment/refund terms before launch."
  },
  {
    title: "Necessary service emails and optional promotional emails",
    text: "By creating an account and continuing after accepting these Terms, you agree to receive necessary account and service-related emails, such as security alerts, account notices, and service updates, when those notices are sent. This agreement is separate from optional promotional permission. Registration, providing an email address, or accepting these Terms does not opt you into updates, announcements, or offers for marketing purposes. Optional permission is unchecked by default and can be changed in your private profile's Email contact preference. Saving an unchecked preference records an opt-out in Mysticmentor; it does not opt you out of essential security or account notices. This implementation does not send promotional campaigns or configure a mailing provider. Before any promotional sending is enabled, the owner must provide and verify an easy unsubscribe mechanism in those emails, honor opt-outs and provider suppression lists, and review applicable consent and service-notice requirements."
  },
  {
    title: "Restrictions, termination, and service availability",
    text: "Administrators may suspend or ban accounts for misuse or safety and service-integrity reasons. Restrictions can block authenticated features without deleting the account or its historical records. Account deletion and related-record handling are not currently provided by an Admin delete button. Features may change or be unavailable, and uninterrupted access is not promised. Mandatory legal rights are not waived by these starter Terms."
  },
  {
    title: "Questions, requests, and changes",
    text: "No verified owner contact or privacy-request address is configured in this repository. The owner must publish an accessible contact and request process before public launch; do not send credentials or sensitive information to an unverified address. Policy versions are shown below and explicit registration acceptance is recorded server-side. Material policy changes and any renewed acceptance requirements need owner/legal review."
  }
] as const;

export const PRIVACY_SECTIONS = [
  {
    title: "Scope and review status",
    text: "This starter Privacy Policy describes information used by the implemented Mysticmentor / Celestial Sanctuary features. It is not legal approval or a claim that every feature is deployed. The owner must verify the actual deployment, applicable laws, provider arrangements, contact details, and retention practices before public launch."
  },
  {
    title: "Account and profile information",
    text: "Firebase Authentication supports sign-in and account recovery. The app stores account identifiers, email addresses, chosen names, roles, registration timestamps, and supported profile fields such as a photo, bio, spiritual interests, and optional zodiac/visibility choices. It also stores account restrictions, virtual Gem balances, gift/rank records, and activity records used by the features you choose. Administrator access adds server-validated PIN sessions and security/audit records; raw PINs are not intended to be stored."
  },
  {
    title: "Content, broadcasts, and transactions",
    text: "Using the relevant features can create reading history, community posts and replies, reports, follow/connection and notification records, scheduling/booking records, live-session and chat events, and video-signaling records. Browser camera or microphone access depends on your permission. Implemented WebRTC paths transmit media between participants; signaling/session records are separate from media. This policy does not promise that other participants cannot record a broadcast or chat. Payment features store transaction references and amounts used for account and financial records. Stripe handles configured checkout and connected-account onboarding; this policy does not claim that full card details are stored in Mysticmentor's member directory."
  },
  {
    title: "How information is used",
    text: "Information is used to provide sign-in, profiles, readings, community and live features, account settings, payments where configured, permission checks, moderation, and troubleshooting. Explicit Terms acceptance and optional email-contact choices have separate server records, timestamps, and versions. A missing or false promotional-email choice is not consent. Required service notices are distinct from promotional email permission."
  },
  {
    title: "Visibility and administrator access",
    text: "Chosen names and content you publish may be visible to other users. Optional public-profile fields have visibility settings in the private profile. Email addresses are not made available in the public member directory; authorized administrators can view member email addresses and email-contact status through protected server endpoints. Community reports and consent histories are protected from direct client access. Administrators can review reports and account status for moderation purposes."
  },
  {
    title: "Service providers and external services",
    text: "The code uses Google Firebase/Firestore for account and application data, Cloudflare R2-compatible storage for supported community images when configured, and Stripe for configured payment features. Some app features also request external content or AI services, including Google Gemini where enabled. Only use those features with information you are comfortable providing. The owner must verify which providers are enabled, what each receives, regional processing, provider retention, and any contractual or international-transfer requirements. No marketing mailing provider or bulk email sender is configured by this phase."
  },
  {
    title: "Browser storage and logs",
    text: "The app uses browser storage for Firebase sign-in state, local preferences and reading/deck settings, and optional remembered Admin session tokens. Closing a tab is not the same as signing out. Server and client errors may produce troubleshooting logs; do not paste secrets or sensitive personal content into reports or diagnostics. This policy does not claim a completed analytics inventory or a deployed automated monitoring service."
  },
  {
    title: "Retention, security, and requests",
    text: "Stored records can remain until handled under an approved retention or account-lifecycle process. The repository does not establish a single verified retention period or an automated complete-account deletion workflow. Financial, moderation, and security records may require separate retention decisions. Access controls, server-side validation, protected rules, and hashed Admin session/PIN records support security, but no system is guaranteed secure. The owner must establish verified contact details and a process for access, correction, deletion, and other privacy requests before launch; none are invented here."
  },
  {
    title: "Your choices and email preferences",
    text: "You can edit supported profile fields, adjust public-profile visibility, and change optional email-contact permission in your private profile. Promotional permission starts unchecked; existing members without a record remain unconsented. Saving an unchecked email preference records withdrawal in the app and preserves a history of the choice. No promotional email is sent by that control. Before a future provider sends marketing, unsubscribe links and suppression handling must be implemented and verified so future sending honors withdrawals; this starter policy does not claim that provider-level unsubscribe already exists. Necessary account/security notices are not switched off by a marketing opt-out. Browser permissions can control camera and microphone access, and signing out limits account access on a shared device."
  }
] as const;
