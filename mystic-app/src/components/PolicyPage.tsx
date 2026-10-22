import { POLICY_REVIEW_NOTICE, PRIVACY_SECTIONS, PRIVACY_VERSION, TERMS_SECTIONS, TERMS_VERSION } from "../lib/policies";
import PolicyLinks from "./PolicyLinks";

export default function PolicyPage({ policy }: { policy: "terms" | "privacy" }) {
  const sections = policy === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = policy === "terms" ? "Terms of Service" : "Privacy Policy";
  return <main className="min-h-screen bg-[#070412] px-4 py-8 text-slate-300 sm:px-8">
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3 border-b border-mystic-gold/30 pb-5">
        <p className="text-xs uppercase tracking-widest text-mystic-gold">Mysticmentor / Celestial Sanctuary</p>
        <h1 className="font-display text-3xl text-white">{title}</h1>
        <p className="text-xs text-slate-400">Version: {policy === "terms" ? TERMS_VERSION : PRIVACY_VERSION}</p>
        <p role="note" className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-sm text-amber-200">{POLICY_REVIEW_NOTICE}</p>
        <PolicyLinks />
      </header>
      {sections.map(({ title: heading, text }) => <section key={heading} className="space-y-2">
        <h2 className="text-lg font-semibold text-white">{heading}</h2>
        <p className="text-sm leading-relaxed">{text}</p>
      </section>)}
      <footer className="flex flex-wrap items-center gap-4 border-t border-mystic-gold/30 pt-5">
        <a href="/onboarding" className="text-sm text-mystic-gold underline">Registration / sign in</a>
        <a href="/" className="text-sm text-mystic-gold underline">Return to Mysticmentor</a>
      </footer>
    </article>
  </main>;
}
