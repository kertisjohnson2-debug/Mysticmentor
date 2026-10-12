import { CELESTIAL_TOOLS, type CelestialToolId } from "./CelestialToolsMenu";

export default function ToolComingSoon({ toolId }: { toolId: CelestialToolId; onOpenCommunity?: () => void }) {
  const tool = CELESTIAL_TOOLS.find((item) => item.id === toolId);
  if (!tool) return null;
  const Icon = tool.icon;
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/95 to-[#0a0618]/95 px-5 py-12 text-center sm:px-8 shadow-[0_0_28px_rgba(243,198,95,0.08)]">
      <Icon className="mx-auto h-9 w-9 text-mystic-gold" aria-hidden="true" />
      <p className="mt-3 inline-block rounded-full border border-teal-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">Coming soon</p>
      <h1 className="mt-3 font-display text-2xl text-white">{tool.label}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{tool.label} is not available yet. Nothing has been created or saved here.</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">The location-based Community Board is a separate public space in the main navigation.</p>
    </section>
  );
}
