import { useEffect, useRef } from "react";
import { CalendarDays, MessagesSquare, ShieldQuestion, UserPlus, Users, X, type LucideIcon } from "lucide-react";

export type CelestialToolId = "scheduling" | "connections" | "groupChats" | "teams";

export type CelestialTool = {
  id: CelestialToolId;
  label: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

// Add future destinations here; the menu and navigation read from this list.
export const CELESTIAL_TOOLS: CelestialTool[] = [
  { id: "scheduling", label: "Scheduling", description: "Book a reading or publish your availability.", icon: CalendarDays },
  { id: "connections", label: "Connections", description: "Find members and build your circle.", icon: UserPlus },
  { id: "groupChats", label: "Group Chats", description: "Shared conversations with your circle.", icon: MessagesSquare, comingSoon: true },
  { id: "teams", label: "Teams", description: "Gather with members around a shared path.", icon: Users, comingSoon: true }
];

type Props = {
  onSelect: (id: CelestialToolId) => void;
  onClose: () => void;
};

export default function CelestialToolsMenu({ onSelect, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="celestial-tools-title">
      <button type="button" aria-label="Close Celestial Tools" onClick={onClose} className="absolute inset-0 bg-[#05020f]/80 backdrop-blur-sm" tabIndex={-1} />
      <div className="relative mb-16 max-h-[calc(100dvh-5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-mystic-gold/50 bg-gradient-to-b from-[#241046] via-[#150a2e] to-[#09051a] p-5 sm:max-w-xl sm:p-6 shadow-[0_0_48px_rgba(123,75,206,0.45)] sm:mb-0 sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <img src="/celestial-owl.png" alt="" aria-hidden="true" className="h-14 w-14 shrink-0 rounded-full border border-mystic-gold/60 object-cover [object-position:49%_50%]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-200">The Owl guides you</p>
            <h2 id="celestial-tools-title" className="font-display text-2xl text-mystic-gold">Celestial Tools</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-300 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {CELESTIAL_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <li key={tool.id}>
                <button type="button" data-soon={tool.comingSoon ? "true" : "false"} onClick={() => onSelect(tool.id)} className="flex h-full min-h-[6rem] w-full items-start gap-3.5 rounded-2xl border border-[#6642a0]/70 bg-[#1a0f36]/80 p-4 text-left transition hover:border-mystic-gold/70 hover:bg-[#241448] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mystic-gold [&[data-soon=true]]:opacity-90">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-mystic-gold/40 bg-mystic-gold/10 text-mystic-gold"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-display text-base text-white">{tool.label}{tool.comingSoon && <span className="whitespace-nowrap rounded-full border border-teal-300/50 bg-teal-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-100">Coming soon</span>}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-300">{tool.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-400"><ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />The Community Board remains in the main navigation as your location-based public community.</p>
      </div>
    </div>
  );
}
