export default function PolicyLinks({ newTab = false }: { newTab?: boolean }) {
  return <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-xs text-mystic-gold">
    <a href="/terms" target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined} className="underline">Terms of Service{newTab && " (new tab)"}</a>
    <a href="/privacy" target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined} className="underline">Privacy Policy{newTab && " (new tab)"}</a>
  </span>;
}
