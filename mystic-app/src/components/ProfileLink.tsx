import type { ReactNode } from "react";

type Props = {
  uid?: string | null;
  name: string;
  onOpen?: (uid: string) => void;
  className?: string;
  label?: string;
  children: ReactNode;
};

// Shared avatar/username link to a member's public profile. Renders plain content when no profile can be opened.
export default function ProfileLink({ uid, name, onOpen, className = "", label, children }: Props) {
  if (!uid || !onOpen) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onOpen(uid); }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={label ?? `View ${name}'s profile`}
      className={`${className} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mystic-gold/60`}
    >
      {children}
    </button>
  );
}
