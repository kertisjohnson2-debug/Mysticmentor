import React from "react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Crown,
  DollarSign,
  Gamepad2,
  Gem,
  Gift,
  Leaf,
  MessageCircle,
  Moon,
  MoonStar,
  Music2,
  PawPrint,
  Sparkles,
  Users,
  Video,
  Wand2,
  Activity,
  User,
  Sun
} from "lucide-react";
import heroArtwork from "../assets/images/IMG_2845.png";

// Dedicated onboarding entry (the app shows its sign in / create account screen to signed-out visitors)
const ONBOARDING_ROUTE = "/onboarding";

const TAGLINE = "Discover Your Path. Connect With Your Spirit. Find Your People.";

const categories = [
  { name: "Tarot & Spirituality", icon: Sparkles },
  { name: "Plants & Gardening", icon: Leaf },
  { name: "Books", icon: BookOpen },
  { name: "Pets", icon: PawPrint },
  { name: "Gaming", icon: Gamepad2 },
  { name: "Music", icon: Music2 },
  { name: "Just Chatting", icon: MessageCircle }
];

function Badge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/50 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-300">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE NOW
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-purple-500/15 border border-purple-300/50 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-purple-200">
      COMING SOON
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  live,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  live: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-mystic-gold/25 bg-gradient-to-b from-[#1b1040]/80 to-[#0b081c]/90 p-5 space-y-3 shadow-[0_0_30px_rgba(124,58,237,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="w-11 h-11 rounded-xl bg-mystic-gold/10 border border-mystic-gold/40 flex items-center justify-center">
          <Icon className="w-5 h-5 text-mystic-gold" />
        </div>
        <Badge live={live} />
      </div>
      <h3 className="font-display text-base font-bold tracking-wide text-mystic-gold uppercase">{title}</h3>
      <div className="text-sm leading-relaxed text-slate-300">{children}</div>
    </article>
  );
}

function EnterButton({ id }: { id: string }) {
  return (
    <a
      id={id}
      href={ONBOARDING_ROUTE}
      className="inline-flex items-center justify-center gap-3 rounded-full border-2 border-mystic-gold/80 bg-gradient-to-r from-purple-700 via-purple-600 to-purple-700 px-8 py-4 font-display text-base sm:text-lg font-bold tracking-widest text-white uppercase shadow-[0_0_35px_rgba(168,85,247,0.55)] hover:brightness-110 active:scale-95 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-mystic-gold/60"
    >
      Enter Mysticmentor <ArrowRight className="w-5 h-5" />
    </a>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center space-y-2 mb-8">
      <p className="text-[11px] font-semibold tracking-[0.3em] text-teal-300 uppercase">{eyebrow}</p>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">{title}</h2>
    </div>
  );
}

const navItems = [
  { label: "Home", icon: Compass },
  { label: "Tarot", icon: Wand2 },
  { label: "Zodiac", icon: Moon },
  { label: "Numbers", icon: Activity },
  { label: "Live", icon: Video },
  { label: "Member", icon: User }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-[#07041a] text-slate-200 overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.25),transparent_60%)]" />

      <main className="relative z-10">
        {/* 1-3. Hero artwork, tagline, CTA */}
        <section className="px-4 pt-6 sm:pt-10 pb-10 flex flex-col items-center text-center">
          <h1 className="sr-only">Mysticmentor — {TAGLINE}</h1>
          <div className="relative w-full max-w-[560px] md:max-w-[640px] lg:max-w-[600px]">
            <img
              src={heroArtwork}
              alt={`Mysticmentor. ${TAGLINE}`}
              className="w-full rounded-3xl border border-mystic-gold/40 shadow-[0_0_80px_rgba(124,58,237,0.45)]"
              loading="eager"
              fetchPriority="high"
            />
            <a
              href={ONBOARDING_ROUTE}
              aria-label="Enter Mysticmentor"
              className="absolute left-[22.75%] top-[78.75%] h-[5.9%] w-[53.75%] z-10 touch-manipulation"
            />
          </div>
          <div className="mt-8 space-y-4 max-w-xl">
            <EnterButton id="landing-enter-hero" />
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 space-y-16 pb-16">
          {/* 4. Live tarot & spiritual readings */}
          <section>
            <SectionTitle eyebrow="Real people. Real time." title="Live Tarot & Spiritual Readings" />
            <div className="grid gap-5 md:grid-cols-2">
              <FeatureCard icon={Video} title="Watch Real Live Broadcasters" live>
                Tune in to real people broadcasting live, chat with them as they go, and connect with the
                broadcasters who speak to you.
              </FeatureCard>
              <FeatureCard icon={Wand2} title="Tarot & Spiritual Readings" live>
                Experience Tarot and spiritual readings live, with card meanings and guidance from gifted
                broadcasters.
              </FeatureCard>
            </div>
          </section>

          {/* 5. Categories */}
          <section>
            <SectionTitle eyebrow="Something for every spirit" title="Live Categories" />
            <div className="flex flex-wrap justify-center gap-3">
              {categories.map(({ name, icon: Icon }) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-2 rounded-full border border-mystic-gold/30 bg-[#140c33]/80 px-4 py-2.5 text-sm font-semibold text-slate-100"
                >
                  <Icon className="w-4 h-4 text-mystic-gold" /> {name}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-purple-300/40 px-4 py-2.5 text-sm text-purple-200">
                <Sparkles className="w-4 h-4" /> And more
              </span>
            </div>
          </section>

          {/* 6-8. Horoscopes, Gems, Ranks */}
          <section>
            <SectionTitle eyebrow="Guidance & support" title="Your Spiritual Toolkit" />
            <div className="grid gap-5 md:grid-cols-3">
              <FeatureCard icon={Sun} title="Horoscopes & Astrology" live>
                Daily horoscopes, zodiac insights, astrology and numerology, all in one place.
              </FeatureCard>
              <FeatureCard icon={Gem} title="Gems & Virtual Gifts" live>
                Collect Gems and send animated virtual gifts to show your support for your favorite live
                broadcasters.
              </FeatureCard>
              <FeatureCard icon={Crown} title="Ranks & Clout" live={false}>
                Build your presence, climb the ranks and grow your clout in the Mysticmentor community.
                Advanced progression is on its way.
              </FeatureCard>
            </div>
          </section>

          {/* 9. Broadcasting */}
          <section>
            <SectionTitle eyebrow="Share your voice" title="Become a Broadcaster" />
            <div className="grid gap-5 md:grid-cols-2">
              <FeatureCard icon={Video} title="Live Broadcasting" live>
                Go live, choose your topic or category, interact with your viewers and build an audience.
              </FeatureCard>
              <FeatureCard icon={DollarSign} title="Earn as a Broadcaster" live={false}>
                We're building ways for eligible broadcasters to receive financial support from their
                audiences. Stay tuned.
              </FeatureCard>
            </div>
          </section>

          {/* 10-11. Affirmation, community and future experiences */}
          <section>
            <SectionTitle eyebrow="What's next" title="More to Discover" />
            <div className="grid gap-5 md:grid-cols-3">
              <FeatureCard icon={Sparkles} title="Daily Affirmation" live={false}>
                A personalized daily affirmation, crafted to inspire and ground your journey.
              </FeatureCard>
              <FeatureCard icon={Users} title="Community" live>
                Chat and connect with others in a positive, supportive environment.
              </FeatureCard>
              <FeatureCard icon={MoonStar} title="More Spiritual Experiences" live={false}>
                <ul className="grid grid-cols-1 gap-1 list-disc list-inside marker:text-mystic-gold">
                  <li>Angel Numbers</li>
                  <li>Dream Meanings</li>
                  <li>Meditation</li>
                  <li>Journaling</li>
                  <li>Moon &amp; astrology experiences</li>
                  <li>More community experiences</li>
                </ul>
              </FeatureCard>
            </div>
          </section>

          {/* In-app navigation preview */}
          <section className="text-center">
            <p className="text-sm text-slate-400 mb-4">Find everything in one simple menu</p>
            <div className="mx-auto flex max-w-lg justify-between rounded-2xl border border-mystic-gold/20 bg-[#0b081c]/90 px-3 py-3">
              {navItems.map(({ label, icon: Icon }) => (
                <div key={label} className="flex flex-col items-center gap-1 text-[11px] text-slate-300">
                  <Icon className={`w-5 h-5 ${label === "Home" ? "text-mystic-gold" : "text-slate-400"}`} />
                  <span className={label === "Home" ? "text-mystic-gold font-semibold" : ""}>{label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 12. Final CTA */}
          <section className="text-center space-y-5">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">Your path is waiting.</h2>
            <EnterButton id="landing-enter-footer" />
          </section>
        </div>
      </main>
    </div>
  );
}
