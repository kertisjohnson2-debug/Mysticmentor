import React from "react";
import artworkMapping from "../../../tarot-artwork-mapping.json";

type TarotArtworkMapping = { id: number; name: string; filename: string };
const artworkById = new Map(
  artworkMapping.map(({ id, filename }) => [id, `/tarot/${filename}`]),
);
if (artworkMapping.length !== 78 || artworkById.size !== 78) {
  throw new Error("Tarot artwork mapping must resolve all 78 local card images.");
}

/**
 * Artwork frame for all 78 Mysticmentor Tarot cards.
 * Keyed by card id (0-21 Major Arcana, 22-35 Wands, 36-49 Cups, 50-63 Swords, 64-77 Pentacles).
 */

const GOLD = "#ffcf4d";
const GOLD_LIGHT = "#fff2b8";
const GOLD_DARK = "#9a5a0a";
const INK = "#0b0620";
const SILVER = "#e8e6f5";
const SKIN = "#f4c9a0";
const TEAL = "#14d4c0";
const WOOD = "#b9873a";
const LEAF = "#22b57a";
const ROSE = "#e0307a";

type P = { x?: number; y?: number; r?: number; s?: number };
const T = ({ x = 0, y = 0, r = 0, s = 1 }: P) => `translate(${x} ${y}) rotate(${r}) scale(${s})`;

const Cup = (p: P) => (
  <g transform={T(p)}>
    <circle cy="-2" r="10" fill="url(#mmHalo)" />
    <path d="M-6.5 -7H6.5C6.5 0 3.4 3.4 0 3.4C-3.4 3.4 -6.5 0 -6.5 -7Z" fill="url(#mmGoldV)" stroke={GOLD_DARK} strokeWidth=".5" />
    <ellipse cy="-7" rx="6.5" ry="1.4" fill="#7a1a5a" stroke={GOLD_LIGHT} strokeWidth=".4" />
    <path d="M-4.6 -5.2Q-4.6 -1 -2 1" stroke="#fff" strokeWidth=".7" fill="none" opacity=".7" />
    <rect x="-.9" y="3.2" width="1.8" height="4.8" fill="url(#mmGoldV)" />
    <circle cy="5.4" r="1.6" fill={ROSE} stroke={GOLD_LIGHT} strokeWidth=".3" />
    <path d="M-4.4 8.8H4.4L3.2 6.8H-3.2Z" fill="url(#mmGoldV)" stroke={GOLD_DARK} strokeWidth=".4" />
  </g>
);
const Sword = (p: P) => (
  <g transform={T(p)}>
    <path d="M-1.8 -16L0 -21L1.8 -16V6H-1.8Z" fill="url(#mmSteel)" stroke="#6a64a8" strokeWidth=".4" />
    <path d="M0 -17V5" stroke="#fff" strokeWidth=".5" />
    <path d="M-5.5 6Q0 4 5.5 6V8.2H-5.5Z" fill="url(#mmGoldV)" stroke={GOLD_DARK} strokeWidth=".3" />
    <rect x="-.9" y="8" width="1.8" height="5" fill="#6a2a1a" />
    <circle cy="14" r="1.6" fill="url(#mmGoldV)" />
    <circle cy="-7" r="9" fill="url(#mmHalo)" opacity=".6" />
  </g>
);
const Wand = (p: P) => (
  <g transform={T(p)}>
    <rect x="-1.3" y="-16" width="2.6" height="32" rx="1.3" fill="url(#mmWood)" stroke="#5a3210" strokeWidth=".3" />
    <ellipse cx="2.8" cy="-9" rx="2.6" ry="1.2" transform="rotate(40 2.8 -9)" fill="url(#mmLeaf)" />
    <ellipse cx="-2.8" cy="-3" rx="2.6" ry="1.2" transform="rotate(-40 -2.8 -3)" fill="url(#mmLeaf)" />
    <ellipse cx="2.8" cy="3" rx="2.6" ry="1.2" transform="rotate(40 2.8 3)" fill="url(#mmLeaf)" />
    <circle cy="-20" r="7" fill="url(#mmFlame)" opacity=".85" />
    <path d="M0 -16Q-2.4 -20 0 -25Q2.4 -20 0 -16Z" fill="#ffb347" />
    <path d="M0 -16.5Q-1 -19 0 -22Q1 -19 0 -16.5Z" fill="#fff3a0" />
  </g>
);
const Star = ({ cx, cy, r, n = 5, k = 0.45, fill = GOLD, rot = -90 }: { cx: number; cy: number; r: number; n?: number; k?: number; fill?: string; rot?: number }) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? r : r * k;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon points={pts.join(" ")} fill={fill} />;
};
const Coin = (p: P) => (
  <g transform={T(p)}>
    <circle r="11" fill="url(#mmHalo)" opacity=".7" />
    <circle r="7.2" fill="url(#mmCoin)" stroke={GOLD_DARK} strokeWidth=".6" />
    <circle r="5.8" fill="none" stroke={GOLD_LIGHT} strokeWidth=".4" strokeDasharray=".8 .8" />
    <Star cx={0} cy={0.4} r={4.4} k={0.4} fill="#7a1a5a" />
    <Star cx={0} cy={0.4} r={2.6} k={0.4} fill={GOLD_LIGHT} />
  </g>
);
const Sun = ({ cx, cy, r, rays = 12, face = false }: { cx: number; cy: number; r: number; rays?: number; face?: boolean }) => (
  <g>
    {Array.from({ length: rays }).map((_, i) => {
      const a = (i * 2 * Math.PI) / rays;
      return <line key={i} x1={cx + Math.cos(a) * r * 1.2} y1={cy + Math.sin(a) * r * 1.2} x2={cx + Math.cos(a) * r * 1.9} y2={cy + Math.sin(a) * r * 1.9} stroke={GOLD} strokeWidth={r * 0.14} strokeLinecap="round" />;
    })}
    <circle cx={cx} cy={cy} r={r} fill={GOLD} stroke={GOLD_LIGHT} strokeWidth=".6" />
    {face && (
      <g fill={GOLD_DARK}>
        <circle cx={cx - r * 0.35} cy={cy - r * 0.15} r={r * 0.09} />
        <circle cx={cx + r * 0.35} cy={cy - r * 0.15} r={r * 0.09} />
        <path d={`M${cx - r * 0.3} ${cy + r * 0.3}Q${cx} ${cy + r * 0.55} ${cx + r * 0.3} ${cy + r * 0.3}`} fill="none" stroke={GOLD_DARK} strokeWidth=".6" />
      </g>
    )}
  </g>
);
const Moon = ({ cx, cy, r, fill = SILVER }: { cx: number; cy: number; r: number; fill?: string }) => (
  <path d={`M${cx} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy + r}A${r * 0.72} ${r * 0.72} 0 1 1 ${cx} ${cy - r}Z`} fill={fill} />
);
const Cloud = ({ x, y, s = 1, fill = "#cfc4ee" }: { x: number; y: number; s?: number; fill?: string }) => (
  <g transform={T({ x, y, s })} fill={fill} opacity=".92">
    <ellipse cx="0" cy="0" rx="9" ry="3.5" />
    <circle cx="-3" cy="-3" r="4" />
    <circle cx="3" cy="-4" r="5" />
  </g>
);
const Fig = ({ x, y, s = 1, robe = "#7a45d6", trim = GOLD, skin = SKIN, hair = "#3b2a1a", arms = "down", hem = 30, hat }: { x: number; y: number; s?: number; robe?: string; trim?: string; skin?: string; hair?: string; arms?: "down" | "up" | "out" | "none"; hem?: number; hat?: "crown" | "cap" | "none" }) => {
  const b = y + 4 * s;
  const arm = (dx: number, dy: number, sign: number) => {
    const sx = x + sign * 5 * s, sy = b + 3 * s, hx = x + sign * dx * s, hy = b + dy * s;
    const mx = (sx + hx) / 2 + sign * 2.4 * s, my = (sy + hy) / 2 + 1.5 * s;
    return (
      <g>
        <path d={`M${sx} ${sy - 1.4 * s}Q${mx + sign * 2 * s} ${my - 1 * s} ${hx + sign * 2.4 * s} ${hy + 1 * s}Q${mx - sign * 0.5 * s} ${my + 3.4 * s} ${sx} ${sy + 2.4 * s}Z`} fill={robe} stroke={trim} strokeWidth=".35" />
        <path d={`M${sx} ${sy - 1.4 * s}Q${mx + sign * 2 * s} ${my - 1 * s} ${hx + sign * 2.4 * s} ${hy + 1 * s}Q${mx - sign * 0.5 * s} ${my + 3.4 * s} ${sx} ${sy + 2.4 * s}Z`} fill="url(#mmShadeV)" opacity=".55" />
        <circle cx={hx} cy={hy} r={1.5 * s} fill={skin} />
        <circle cx={hx - 0.4 * s} cy={hy - 0.4 * s} r={0.7 * s} fill="#fff" opacity=".3" />
      </g>
    );
  };
  const body = `M${x - 4.6 * s} ${b}Q${x} ${b - 2.4 * s} ${x + 4.6 * s} ${b}Q${x + 6 * s} ${b + 10 * s} ${x + 5 * s} ${b + 13 * s}L${x + 10.5 * s} ${b + hem * s}Q${x} ${b + (hem + 3) * s} ${x - 10.5 * s} ${b + hem * s}L${x - 5 * s} ${b + 13 * s}Q${x - 6 * s} ${b + 10 * s} ${x - 4.6 * s} ${b}Z`;
  return (
    <g>
      <circle cx={x} cy={y + 2 * s} r={14 * s} fill="url(#mmAura)" />
      <path d={`M${x - 4 * s} ${y - 1 * s}Q${x - 9 * s} ${y + 8 * s} ${x - 7 * s} ${y + 22 * s}Q${x - 3 * s} ${y + 17 * s} ${x} ${y + 17 * s}Q${x + 3 * s} ${y + 17 * s} ${x + 7 * s} ${y + 22 * s}Q${x + 9 * s} ${y + 8 * s} ${x + 4 * s} ${y - 1 * s}Z`} fill={hair} />
      <path d={body} fill={robe} stroke={trim} strokeWidth=".5" />
      <path d={body} fill="url(#mmShade)" />
      <path d={`M${x - 1 * s} ${b + 2 * s}Q${x - 3 * s} ${b + (hem / 2) * s} ${x - 5 * s} ${b + hem * s}M${x + 2 * s} ${b + 2 * s}Q${x + 4 * s} ${b + (hem / 2) * s} ${x + 6 * s} ${b + hem * s}M${x - 7 * s} ${b + (hem - 3) * s}Q${x - 7.5 * s} ${b + (hem / 2) * s} ${x - 5 * s} ${b + 14 * s}`} stroke="#000" strokeWidth=".4" opacity=".3" fill="none" />
      <path d={`M${x - 10 * s} ${b + (hem - 2) * s}Q${x} ${b + hem * s} ${x + 10 * s} ${b + (hem - 2) * s}`} stroke={trim} strokeWidth=".9" fill="none" />
      <path d={`M${x - 8 * s} ${b + (hem - 5) * s}Q${x} ${b + (hem - 3) * s} ${x + 8 * s} ${b + (hem - 5) * s}`} stroke={trim} strokeWidth=".35" strokeDasharray=".8 1" fill="none" opacity=".8" />
      <path d={`M${x - 2.6 * s} ${b - 0.5 * s}L${x} ${b + 8 * s}L${x + 2.6 * s} ${b - 0.5 * s}`} fill="none" stroke={trim} strokeWidth=".6" />
      <rect x={x - 4.2 * s} y={b + 9.4 * s} width={8.4 * s} height={1.4 * s} fill="url(#mmGoldV)" />
      <circle cx={x} cy={b + 10.1 * s} r={1 * s} fill="#ff4a8a" stroke={GOLD_LIGHT} strokeWidth=".25" />
      <path d={`M${x + 4.6 * s} ${b}Q${x + 6 * s} ${b + 10 * s} ${x + 5 * s} ${b + 13 * s}L${x + 10.5 * s} ${b + hem * s}`} fill="none" stroke="#fff6d8" strokeWidth=".6" opacity=".45" />
      {arms === "up" && <>{arm(11, -10, -1)}{arm(11, -10, 1)}</>}
      {arms === "out" && <>{arm(12, 6, -1)}{arm(12, 6, 1)}</>}
      {arms === "down" && <>{arm(7, 14, -1)}{arm(7, 14, 1)}</>}
      <rect x={x - 1.3 * s} y={y + 2 * s} width={2.6 * s} height={3 * s} fill={skin} />
      <ellipse cx={x} cy={y} rx={3.7 * s} ry={4.3 * s} fill={skin} />
      <ellipse cx={x + 1.4 * s} cy={y + 0.6 * s} rx={2.3 * s} ry={3.6 * s} fill="url(#mmShadeV)" opacity=".35" />
      <path d={`M${x - 4 * s} ${y + 0.6 * s}Q${x - 3.8 * s} ${y - 4.8 * s} ${x} ${y - 4.8 * s}Q${x + 3.8 * s} ${y - 4.8 * s} ${x + 4 * s} ${y + 0.6 * s}Q${x + 1.5 * s} ${y - 2.4 * s} ${x - 1 * s} ${y - 1.6 * s}Q${x - 2.6 * s} ${y - 1 * s} ${x - 4 * s} ${y + 0.6 * s}Z`} fill={hair} />
      <path d={`M${x - 2.4 * s} ${y + 0.1 * s}q${1 * s} ${-0.7 * s} ${2 * s} 0M${x + 0.4 * s} ${y + 0.1 * s}q${1 * s} ${-0.7 * s} ${2 * s} 0`} stroke="#2a1030" strokeWidth={0.4 * s} fill="none" />
      <circle cx={x - 1.4 * s} cy={y + 0.6 * s} r={0.42 * s} fill="#2a1030" />
      <circle cx={x + 1.4 * s} cy={y + 0.6 * s} r={0.42 * s} fill="#2a1030" />
      <path d={`M${x - 0.9 * s} ${y + 2.5 * s}Q${x} ${y + 3.1 * s} ${x + 0.9 * s} ${y + 2.5 * s}`} stroke="#c0405a" strokeWidth={0.55 * s} fill="none" />
      <circle cx={x - 2 * s} cy={y + 1.8 * s} r={0.9 * s} fill="#ff7a9a" opacity=".3" />
      <circle cx={x + 2 * s} cy={y + 1.8 * s} r={0.9 * s} fill="#ff7a9a" opacity=".3" />
      <path d={`M${x - 2.4 * s} ${y + 4.6 * s}Q${x} ${y + 7 * s} ${x + 2.4 * s} ${y + 4.6 * s}`} stroke={GOLD} strokeWidth=".4" fill="none" />
      <circle cx={x} cy={y + 6.2 * s} r={0.7 * s} fill="#6af0ff" />
      {hat === "crown" && <path d={`M${x - 4.4 * s} ${y - 3 * s}L${x - 4.4 * s} ${y - 7.6 * s}L${x - 2.2 * s} ${y - 5 * s}L${x} ${y - 8.8 * s}L${x + 2.2 * s} ${y - 5 * s}L${x + 4.4 * s} ${y - 7.6 * s}L${x + 4.4 * s} ${y - 3 * s}Z`} fill="url(#mmGoldV)" stroke={GOLD_DARK} strokeWidth=".3" />}
      {hat === "cap" && <><path d={`M${x - 4.6 * s} ${y - 1 * s}Q${x} ${y - 8.4 * s} ${x + 4.6 * s} ${y - 1 * s}Z`} fill={trim} /><path d={`M${x + 1 * s} ${y - 6 * s}Q${x + 7 * s} ${y - 10 * s} ${x + 9 * s} ${y - 5 * s}`} stroke="#fff" strokeWidth=".6" fill="none" /></>}
    </g>
  );
};
const Ground = ({ y = 92, c = "#2a1a5a", c2 = "#3b2480" }: { y?: number; c?: string; c2?: string }) => (
  <g>
    <path d={`M8 ${y}Q30 ${y - 6} 50 ${y - 1}T92 ${y - 2}V112H8Z`} fill={c2} />
    <path d={`M8 ${y}Q30 ${y - 6} 50 ${y - 1}T92 ${y - 2}`} fill="none" stroke={GOLD_LIGHT} strokeWidth=".6" opacity=".55" />
    <path d={`M8 ${y + 8}Q35 ${y + 2} 60 ${y + 7}T92 ${y + 5}V112H8Z`} fill={c} />
    <path d={`M8 ${y}V112H92V${y - 2}`} fill="url(#mmGroundShade)" />
  </g>
);
const Sea = ({ y = 82, c = "#0f5f7a" }: { y?: number; c?: string }) => (
  <g>
    <rect x="8" y={y} width="84" height={112 - y} fill={c} />
    {[0, 1, 2].map((i) => (
      <path key={i} d={`M8 ${y + 5 + i * 8}q5 -3 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0`} stroke="#8fe6f0" strokeWidth=".5" fill="none" opacity=".7" />
    ))}
  </g>
);
const Mount = ({ x, w, h, y = 92, c = "#e9e4ff" }: { x: number; w: number; h: number; y?: number; c?: string }) => (
  <g>
    <path d={`M${x - w / 2} ${y}L${x} ${y - h}L${x + w / 2} ${y}Z`} fill={c} opacity=".85" />
    <path d={`M${x - w * 0.12} ${y - h * 0.76}L${x} ${y - h}L${x + w * 0.12} ${y - h * 0.76}L${x + w * 0.04} ${y - h * 0.84}L${x - w * 0.04} ${y - h * 0.7}Z`} fill="#fff" />
  </g>
);
const Pillar = ({ x, y = 112, h = 80, w = 8, c = "#e6dcff" }: { x: number; y?: number; h?: number; w?: number; c?: string }) => (
  <g>
    <rect x={x - w / 2} y={y - h} width={w} height={h} fill={c} stroke={GOLD} strokeWidth=".4" />
    <rect x={x - w / 2 - 1.5} y={y - h - 3} width={w + 3} height="3" fill={GOLD} />
    <rect x={x - w / 2 - 1.5} y={y - 3} width={w + 3} height="3" fill={GOLD} />
  </g>
);
const Tower = ({ x, y = 96, w = 10, h = 30, c = "#d9cff5" }: { x: number; y?: number; w?: number; h?: number; c?: string }) => (
  <g>
    <rect x={x - w / 2} y={y - h} width={w} height={h} fill={c} stroke={GOLD} strokeWidth=".4" />
    <path d={`M${x - w / 2 - 1} ${y - h}L${x} ${y - h - 8}L${x + w / 2 + 1} ${y - h}Z`} fill={GOLD} />
    <rect x={x - 1.2} y={y - h + 6} width="2.4" height="5" rx="1.2" fill={INK} />
  </g>
);
const Bolt = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path d="M0 0L-6 14L-1 14L-5 28L7 10L2 10L6 0Z" transform={T({ x, y, s })} fill="#fff6a8" stroke={GOLD} strokeWidth=".5" />
);
const Dog = ({ x, y, s = 1, flip = false, c = "#f3ecff" }: { x: number; y: number; s?: number; flip?: boolean; c?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill={c}>
    <ellipse cx="0" cy="0" rx="6" ry="3" />
    <circle cx="6" cy="-3" r="2.5" />
    <path d="M7 -5L8.5 -8L9 -4Z" />
    <rect x="-5" y="1" width="1.6" height="5" />
    <rect x="3" y="1" width="1.6" height="5" />
    <path d="M-6 -1Q-9 -4 -8 -6" stroke={c} strokeWidth="1.2" fill="none" />
  </g>
);
const Horse = ({ x, y, s = 1, c = "#f4efff", walk = false }: { x: number; y: number; s?: number; c?: string; walk?: boolean }) => (
  <g transform={T({ x, y, s })} fill={c} stroke={GOLD} strokeWidth=".4">
    <ellipse cx="0" cy="0" rx="17" ry="8" />
    <path d="M12 -4L20 -16L26 -14L27 -9L22 -8L17 2Z" />
    <path d="M20 -16L19 -20L22 -17Z" />
    <path d="M-16 -3Q-24 0 -22 12" fill="none" strokeWidth="2" />
    {walk ? (
      <>
        <path d="M-10 5L-12 22M-4 6L-3 22M6 6L10 20M12 4L16 16" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ) : (
      <path d="M-10 5L-12 22M-4 6L-5 22M6 6L5 22M12 4L13 22" fill="none" strokeWidth="2.2" strokeLinecap="round" />
    )}
  </g>
);
const Heart = ({ x, y, s = 1, fill = ROSE }: { x: number; y: number; s?: number; fill?: string }) => (
  <path d="M0 8C-12 -2 -9 -10 -4 -10C-1 -10 0 -7 0 -6C0 -7 1 -10 4 -10C9 -10 12 -2 0 8Z" transform={T({ x, y, s })} fill={fill} stroke={GOLD} strokeWidth=".5" />
);
const Hand = ({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <Cloud x={10} y={8} s={0.9} />
    <path d="M-3 4Q0 0 3 3L5 0L7 2L8 6L2 9Z" fill={SKIN} stroke="#c9a67f" strokeWidth=".3" />
  </g>
);
const Rose = ({ x, y, s = 1, c = ROSE }: { x: number; y: number; s?: number; c?: string }) => (
  <g transform={T({ x, y, s })}>
    <circle r="2.4" fill={c} />
    <circle r="1" fill="#fff" opacity=".4" />
    <path d="M0 2.4V7" stroke={LEAF} strokeWidth=".7" />
  </g>
);
const Arch = ({ x, y, w, h, c = "#d9cff5" }: { x: number; y: number; w: number; h: number; c?: string }) => (
  <path d={`M${x - w / 2} ${y}V${y - h * 0.6}A${w / 2} ${h * 0.4} 0 0 1 ${x + w / 2} ${y - h * 0.6}V${y}H${x + w / 2 - 4}V${y - h * 0.6}A${w / 2 - 4} ${h * 0.4 - 4} 0 0 0 ${x - w / 2 + 4} ${y - h * 0.6}V${y}Z`} fill={c} stroke={GOLD} strokeWidth=".4" />
);
const Wing = ({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill="#fff4d6" stroke={GOLD} strokeWidth=".4">
    <path d="M0 0Q10 -12 24 -10Q20 -6 22 -3Q16 -2 17 2Q10 2 8 6Q2 5 0 0Z" />
  </g>
);
const Rain = ({ n = 14 }: { n?: number }) => (
  <g stroke="#9fb4ff" strokeWidth=".5" opacity=".8">
    {Array.from({ length: n }).map((_, i) => {
      const x = 12 + ((i * 29) % 78);
      const y = 18 + ((i * 41) % 70);
      return <line key={i} x1={x} y1={y} x2={x - 2} y2={y + 6} />;
    })}
  </g>
);
const Stars = ({ id }: { id: number }) => (
  <g fill="#fff">
    {Array.from({ length: 16 }).map((_, i) => (
      <circle key={i} cx={(id * 37 + i * 53) % 84 + 8} cy={(id * 17 + i * 29) % 92 + 10} r={0.3 + ((i + id) % 3) * 0.2} opacity={0.35 + ((i + id) % 4) * 0.15} />
    ))}
  </g>
);

const MINOR_SKY: Record<string, [string, string]> = {
  wands: ["#3a1450", "#a0482c"],
  cups: ["#13245a", "#2a8aa0"],
  swords: ["#1b1a4a", "#5a6cb0"],
  pentacles: ["#1e2c3a", "#4c7a3a"],
};
const SUITS = ["wands", "cups", "swords", "pentacles"] as const;
type Suit = (typeof SUITS)[number];
const Emblem = ({ suit, ...p }: { suit: Suit } & P) =>
  suit === "wands" ? <Wand {...p} /> : suit === "cups" ? <Cup {...p} /> : suit === "swords" ? <Sword {...p} /> : <Coin {...p} />;

type Scene = { sky: [string, string]; draw: React.ReactNode };

const MAJOR: Record<number, () => Scene> = {
  0: () => ({
    sky: ["#2b1a63", "#c58be0"],
    draw: (
      <>
        <Sun cx={72} cy={30} r={7} />
        <Mount x={26} w={46} h={34} y={96} />
        <Mount x={78} w={40} h={26} y={96} />
        <path d="M8 80H60L64 96L58 112H8Z" fill="#4b2a8a" stroke={GOLD} strokeWidth=".5" />
        <Dog x={22} y={73} s={0.9} />
        <Fig x={44} y={48} s={1} robe="#f0b24a" arms="down" hem={22} hat="cap" />
        <line x1="49" y1="56" x2="62" y2="38" stroke={WOOD} strokeWidth="1.2" />
        <circle cx="62" cy="38" r="3.2" fill="#e8d6ff" />
        <Rose x={38} y={62} s={0.8} c="#fff" />
      </>
    ),
  }),
  1: () => ({
    sky: ["#3a1670", "#7a3fd0"],
    draw: (
      <>
        <path d="M38 22C38 14 50 14 50 22C50 30 62 30 62 22C62 14 50 14 50 22C50 30 38 30 38 22Z" fill="none" stroke={GOLD} strokeWidth="1.4" />
        <Fig x={50} y={40} s={1.15} robe="#f4eaff" trim={ROSE} arms="up" hem={32} hat="none" />
        <line x1="64" y1="40" x2="70" y2="26" stroke={WOOD} strokeWidth="1.6" />
        <circle cx="70" cy="25" r="1.6" fill={GOLD_LIGHT} />
        <line x1="36" y1="40" x2="30" y2="54" stroke={SILVER} strokeWidth="1.2" />
        <rect x="18" y="86" width="64" height="5" rx="1" fill="#5b3a1a" stroke={GOLD} strokeWidth=".4" />
        <Cup x={28} y={80} s={0.55} />
        <Wand x={42} y={79} s={0.5} r={90} />
        <Sword x={57} y={80} s={0.5} />
        <Coin x={72} y={81} s={0.55} />
        <Ground y={98} />
        {[16, 26, 74, 84].map((x) => <Rose key={x} x={x} y={98} s={0.9} />)}
      </>
    ),
  }),
  2: () => ({
    sky: ["#101a4a", "#3a3a9a"],
    draw: (
      <>
        <Pillar x={20} h={86} c="#14143a" />
        <Pillar x={80} h={86} c="#f4eaff" />
        <path d="M30 20Q50 10 70 20V90H30Z" fill="#3a5cc0" opacity=".55" />
        <Moon cx={50} cy={22} r={5} />
        <Fig x={50} y={44} s={1.15} robe="#3a63c8" trim={SILVER} arms="down" hem={36} hat="none" />
        <path d="M44 38Q50 28 56 38" stroke={SILVER} fill="none" strokeWidth="1.2" />
        <rect x="44" y="36" width="12" height="2.5" fill={SILVER} />
        <rect x="42" y="64" width="16" height="9" rx="1" fill="#f4eaff" stroke={GOLD} strokeWidth=".4" />
        <Moon cx={50} cy={104} r={5} />
      </>
    ),
  }),
  3: () => ({
    sky: ["#3a1a60", "#d58aa8"],
    draw: (
      <>
        <path d="M8 90Q30 78 50 88T92 84V112H8Z" fill="#c9a43a" />
        {[14, 24, 34, 66, 76, 86].map((x) => <path key={x} d={`M${x} 98V84M${x} 90l-2 -3M${x} 90l2 -3`} stroke="#f6d36a" strokeWidth=".9" />)}
        <rect x="30" y="36" width="40" height="42" rx="6" fill="#7a3a8a" opacity=".6" />
        {Array.from({ length: 12 }).map((_, i) => <Star key={i} cx={50 + 12 * Math.cos((i * Math.PI) / 6)} cy={26 + 12 * Math.sin((i * Math.PI) / 6)} r={1.6} n={5} />)}
        <Fig x={50} y={36} s={1.2} robe="#f4a8c0" trim={GOLD} arms="down" hem={34} hat="crown" />
        <path d="M38 62Q50 54 62 62" stroke={ROSE} fill="none" strokeWidth="1" />
        <Heart x={70} y={74} s={0.8} />
        <path d="M70 80V86M66 84H74" stroke={GOLD} strokeWidth="1" />
      </>
    ),
  }),
  4: () => ({
    sky: ["#4a1520", "#c8582a"],
    draw: (
      <>
        <Mount x={22} w={46} h={40} y={96} c="#b8744a" />
        <Mount x={80} w={44} h={34} y={96} c="#b8744a" />
        <rect x="26" y="30" width="48" height="66" rx="4" fill="#3a2a60" stroke={GOLD} strokeWidth=".6" />
        <circle cx="26" cy="38" r="3.5" fill={GOLD} /><circle cx="74" cy="38" r="3.5" fill={GOLD} />
        <Fig x={50} y={40} s={1.2} robe="#d3392f" trim={GOLD} arms="down" hem={36} hat="crown" />
        <path d="M44 48L56 48" stroke="#d8d8e8" strokeWidth="3" />
        <line x1="70" y1="48" x2="70" y2="78" stroke={GOLD} strokeWidth="1.4" />
        <circle cx="70" cy="46" r="2.4" fill="none" stroke={GOLD} strokeWidth="1.2" />
        <circle cx="38" cy="66" r="4" fill="#d8d8e8" opacity=".9" />
      </>
    ),
  }),
  5: () => ({
    sky: ["#2a1a5a", "#7a58c0"],
    draw: (
      <>
        <Pillar x={18} h={90} c="#e6dcff" />
        <Pillar x={82} h={90} c="#e6dcff" />
        <rect x="30" y="32" width="40" height="64" fill="#4b2a8a" opacity=".6" />
        <Fig x={50} y={40} s={1.2} robe="#c43d3d" trim={GOLD} arms="down" hem={36} />
        <path d="M44 36l3 -8l3 4l3 -4l3 8Z" fill={GOLD} />
        <path d="M42 30l8 -6l8 6" stroke={GOLD} strokeWidth="1" fill="none" />
        <line x1="66" y1="46" x2="66" y2="86" stroke={GOLD} strokeWidth="1.2" />
        <path d="M62 50h8M62 56h8M62 62h8" stroke={GOLD} strokeWidth="1" />
        <Fig x={34} y={80} s={0.55} robe="#4aa89a" arms="none" hem={14} />
        <Fig x={66} y={82} s={0.55} robe="#a85a9a" arms="none" hem={12} />
        <path d="M26 96l8 -8M34 96l-8 -8" stroke={GOLD} strokeWidth="1.2" />
      </>
    ),
  }),
  6: () => ({
    sky: ["#3a2a7a", "#e0a0c0"],
    draw: (
      <>
        <Sun cx={50} cy={20} r={5} />
        <Wing x={42} y={34} s={0.8} flip /><Wing x={58} y={34} s={0.8} />
        <Fig x={50} y={30} s={0.8} robe="#c8a8ff" arms="out" hem={20} />
        <Mount x={50} w={30} h={34} y={96} c="#8a68d0" />
        <Fig x={30} y={64} s={0.95} robe="#e9d6ff" arms="down" hem={28} />
        <Fig x={70} y={64} s={0.95} robe="#e07a50" arms="down" hem={28} hair="#8a4a1a" />
        <path d="M14 96V68Q24 56 20 48" stroke="#5a8a3a" strokeWidth="2" fill="none" />
        <circle cx="20" cy="50" r="5" fill="#46c08a" />
        <path d="M86 96V68Q80 56 82 46" stroke="#5a8a3a" strokeWidth="2" fill="none" />
        <circle cx="82" cy="48" r="5" fill={ROSE} />
        <Ground y={96} />
      </>
    ),
  }),
  7: () => ({
    sky: ["#0e1a4a", "#3a5ac0"],
    draw: (
      <>
        <path d="M12 54Q50 14 88 54V60Q50 24 12 60Z" fill="#2a3a9a" stroke={GOLD} strokeWidth=".6" />
        {[26, 40, 50, 60, 74].map((x, i) => <Star key={i} cx={x} cy={i % 2 ? 36 : 40} r={2} n={5} />)}
        <Tower x={14} y={92} w={8} h={20} /><Tower x={86} y={92} w={8} h={20} />
        <rect x="26" y="62" width="48" height="16" rx="3" fill="#e9e4ff" stroke={GOLD} strokeWidth=".6" />
        <Fig x={50} y={46} s={0.95} robe="#c8d4ff" trim={GOLD} arms="down" hem={20} hat="crown" />
        <ellipse cx="38" cy="86" rx="10" ry="6" fill="#16102a" stroke={GOLD} strokeWidth=".5" />
        <ellipse cx="62" cy="86" rx="10" ry="6" fill="#f4efff" stroke={GOLD} strokeWidth=".5" />
        <circle cx="30" cy="80" r="3.5" fill="#16102a" stroke={GOLD} strokeWidth=".5" />
        <circle cx="70" cy="80" r="3.5" fill="#f4efff" stroke={GOLD} strokeWidth=".5" />
        <circle cx="34" cy="94" r="5" fill="none" stroke={GOLD} strokeWidth="1" /><circle cx="66" cy="94" r="5" fill="none" stroke={GOLD} strokeWidth="1" />
      </>
    ),
  }),
  8: () => ({
    sky: ["#3a1a60", "#e0a050"],
    draw: (
      <>
        <path d="M42 22C42 16 50 16 50 22C50 28 58 28 58 22C58 16 50 16 50 22C50 28 42 28 42 22Z" fill="none" stroke={GOLD} strokeWidth="1.2" />
        <Mount x={20} w={36} h={28} y={96} c="#8a68d0" />
        <Ground y={96} />
        <Fig x={38} y={40} s={1.1} robe="#f4eaff" trim={GOLD} arms="out" hem={36} />
        <circle cx="38" cy="36" r="1.2" fill={ROSE} />
        <g transform="translate(66 80)" fill="#e0a040" stroke={GOLD_DARK} strokeWidth=".4">
          <ellipse cx="0" cy="0" rx="14" ry="8" />
          <circle cx="-14" cy="-6" r="8" />
          <circle cx="-14" cy="-6" r="10" fill="none" stroke="#a86a1a" strokeWidth="2.4" strokeDasharray="2 1.6" />
          <circle cx="-16" cy="-8" r="1" fill={INK} /><path d="M-19 -2Q-16 0 -12 -2" stroke={INK} fill="none" strokeWidth=".6" />
          <path d="M14 -2Q24 -4 22 6" fill="none" strokeWidth="2" /><rect x="-8" y="6" width="3" height="10" /><rect x="6" y="6" width="3" height="10" />
        </g>
        <path d="M44 66Q56 70 60 74" stroke={ROSE} strokeWidth="1.2" fill="none" />
      </>
    ),
  }),
  9: () => ({
    sky: ["#14143a", "#4a58a8"],
    draw: (
      <>
        <Stars id={9} />
        <Mount x={32} w={64} h={70} y={100} c="#c8c0e8" />
        <Mount x={74} w={36} h={30} y={100} c="#a8a0d8" />
        <Fig x={46} y={34} s={1.15} robe="#8a8a9a" trim={SILVER} arms="down" hem={40} hat="cap" hair="#d8d8e8" />
        <line x1="62" y1="38" x2="62" y2="82" stroke={WOOD} strokeWidth="1.4" />
        <line x1="58" y1="44" x2="62" y2="44" stroke={WOOD} strokeWidth="1" />
        <rect x="54" y="42" width="8" height="10" rx="2" fill="#2a2a5a" stroke={GOLD} strokeWidth=".6" />
        <Star cx={58} cy={47} r={3.2} n={6} k={0.5} fill="#fff6c8" />
        <circle cx="58" cy="47" r="9" fill={GOLD} opacity=".18" />
      </>
    ),
  }),
  10: () => ({
    sky: ["#14143a", "#5b34a8"],
    draw: (
      <>
        <Stars id={10} />
        <circle cx="50" cy="60" r="30" fill="none" stroke={GOLD} strokeWidth="2.2" />
        <circle cx="50" cy="60" r="22" fill="none" stroke={GOLD_LIGHT} strokeWidth=".8" />
        <circle cx="50" cy="60" r="7" fill={GOLD} stroke={GOLD_DARK} strokeWidth=".6" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={50 + Math.cos(a) * 7} y1={60 + Math.sin(a) * 7} x2={50 + Math.cos(a) * 30} y2={60 + Math.sin(a) * 30} stroke={GOLD} strokeWidth="1" />;
        })}
        {["I", "O", "I", "O"].map((_, i) => <circle key={i} cx={50 + Math.cos((i * Math.PI) / 2 + 0.4) * 26} cy={60 + Math.sin((i * Math.PI) / 2 + 0.4) * 26} r="2.4" fill={i % 2 ? TEAL : ROSE} />)}
        <g fill={WOOD}><path d="M42 26L50 16L58 26Z" /><circle cx="50" cy="19" r="3" fill={SKIN} /></g>
        <Moon cx={14} cy={20} r={4} /><Star cx={86} cy={20} r={5} n={8} k={0.4} />
        <path d="M18 100Q50 88 82 100" stroke={TEAL} fill="none" strokeWidth="1.2" />
        <path d="M14 98l4 8M86 98l-4 8" stroke={GOLD} strokeWidth="1" />
      </>
    ),
  }),
  11: () => ({
    sky: ["#2a1a5a", "#8a68d0"],
    draw: (
      <>
        <Pillar x={20} h={90} c="#e6dcff" /><Pillar x={80} h={90} c="#e6dcff" />
        <path d="M28 24Q50 12 72 24V90H28Z" fill="#c43d3d" opacity=".5" />
        <Fig x={50} y={36} s={1.15} robe="#d8353a" trim={GOLD} arms="down" hem={36} hat="crown" />
        <line x1="34" y1="44" x2="34" y2="86" stroke={SILVER} strokeWidth="1.4" />
        <rect x="31" y="46" width="6" height="2" fill={GOLD} />
        <path d="M60 56h20M70 56v-4M60 56v6h4l-2 4h-4M80 56v6h-4l2 4h4" stroke={GOLD} strokeWidth="1" fill="none" />
        <line x1="52" y1="54" x2="52" y2="24" stroke="none" />
        <Sword x={34} y={62} s={1.1} r={0} />
      </>
    ),
  }),
  12: () => ({
    sky: ["#1a2a5a", "#5a8ad0"],
    draw: (
      <>
        <rect x="22" y="22" width="56" height="4" rx="1.5" fill="#5b3a1a" stroke={GOLD} strokeWidth=".4" />
        <rect x="18" y="22" width="4" height="82" fill="#5b3a1a" /><rect x="78" y="22" width="4" height="82" fill="#5b3a1a" />
        <path d="M22 22Q18 18 22 15M78 22Q82 18 78 15" stroke={LEAF} strokeWidth="1.4" fill="none" />
        <line x1="50" y1="26" x2="50" y2="38" stroke={ROSE} strokeWidth="1.4" />
        <g transform="translate(50 38)">
          <path d="M-5 0H5L4 22H-4Z" fill="#3a63c8" stroke={GOLD} strokeWidth=".4" />
          <path d="M-4 22L-10 32M4 22L10 32" stroke="#d3392f" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="36" r="4.2" fill={SKIN} />
          <path d="M-4.2 36a4.2 4.2 0 0 0 8.4 0Z" fill="#8a4a1a" />
          <circle cx="0" cy="36" r="8" fill="none" stroke={GOLD} strokeWidth=".8" />
          <circle cx="0" cy="36" r="10" fill={GOLD} opacity=".15" />
        </g>
        <Ground y={100} c="#1a1a3a" c2="#2a2a5a" />
      </>
    ),
  }),
  13: () => ({
    sky: ["#14102a", "#6a4aa0"],
    draw: (
      <>
        <Tower x={26} y={96} w={8} h={26} c="#8a78c0" /><Tower x={74} y={96} w={8} h={26} c="#8a78c0" />
        <path d="M34 96Q50 60 66 96Z" fill={GOLD} opacity=".7" />
        <Sun cx={50} cy={88} r={5} rays={10} />
        <Horse x={42} y={78} s={1} c="#f6f2ff" walk />
        <Fig x={44} y={36} s={0.95} robe="#2a2a3a" trim={SILVER} arms="down" hem={22} skin="#f2ecff" hair="#2a2a3a" />
        <circle cx="44" cy="36" r="4" fill="#f2ecff" /><circle cx="42.5" cy="35" r=".9" fill={INK} /><circle cx="45.5" cy="35" r=".9" fill={INK} />
        <line x1="54" y1="40" x2="54" y2="70" stroke="#c8c0e0" strokeWidth="1.2" />
        <path d="M54 42L68 46L54 52Z" fill="#1a1a2a" stroke={GOLD} strokeWidth=".4" />
        <circle cx="60" cy="47" r="2.2" fill="#fff" /><Rose x={60} y={47} s={0.6} c="#fff" />
        <Ground y={100} c="#14102a" c2="#241a4a" />
      </>
    ),
  }),
  14: () => ({
    sky: ["#3a2a7a", "#f0c08a"],
    draw: (
      <>
        <Mount x={50} w={20} h={40} y={96} c="#c8a8ff" />
        <Sun cx={50} cy={30} r={4} rays={10} />
        <Wing x={44} y={44} s={1} flip /><Wing x={56} y={44} s={1} />
        <Fig x={50} y={44} s={1.1} robe="#f4eaff" trim={GOLD} arms="out" hem={32} hat="none" />
        <Star cx={50} cy={62} r={3.4} n={3} k={0.5} fill={GOLD} />
        <Cup x={34} y={58} s={0.8} r={-20} /><Cup x={66} y={78} s={0.8} r={20} />
        <path d="M37 66Q50 70 62 74" stroke="#9fe3ff" strokeWidth="1.2" fill="none" strokeDasharray="1.6 1.2" />
        <Sea y={92} c="#2a6aa0" />
        <path d="M14 96Q24 90 30 96" stroke={LEAF} fill="none" strokeWidth="1.2" />
        <Rose x={18} y={92} s={0.8} c="#b88aff" />
      </>
    ),
  }),
  15: () => ({
    sky: ["#14061a", "#5a1a3a"],
    draw: (
      <>
        <Stars id={15} />
        <rect x="32" y="74" width="36" height="22" fill="#2a1a3a" stroke={GOLD} strokeWidth=".6" />
        <Wing x={42} y={34} s={1} flip /><Wing x={58} y={34} s={1} />
        <path d="M40 24L36 14L44 22M60 24L64 14L56 22" fill="#e8d6ff" stroke={GOLD} strokeWidth=".4" />
        <circle cx="50" cy="32" r="7" fill="#9a3a3a" />
        <circle cx="47" cy="31" r="1.2" fill={GOLD_LIGHT} /><circle cx="53" cy="31" r="1.2" fill={GOLD_LIGHT} />
        <path d="M46 36Q50 40 54 36" stroke={INK} fill="none" strokeWidth="1" />
        <path d="M42 40H58L62 72H38Z" fill="#6a2a4a" stroke={GOLD} strokeWidth=".5" />
        <path d="M38 72L36 40M62 72L64 40" stroke="#6a2a4a" strokeWidth="3" />
        <Star cx={50} cy={22} r={4} n={5} k={0.4} fill="none" rot={90} />
        <path d="M50 24L47 32H53Z" fill="none" />
        <Fig x={42} y={86} s={0.5} robe="#c07a50" arms="none" hem={14} />
        <Fig x={58} y={86} s={0.5} robe="#7a8ac0" arms="none" hem={14} />
        <path d="M42 90Q50 84 58 90" stroke={SILVER} strokeWidth="1" fill="none" strokeDasharray="1.4 1" />
      </>
    ),
  }),
  16: () => ({
    sky: ["#0e0a22", "#5a2a6a"],
    draw: (
      <>
        <Stars id={16} />
        <Mount x={50} w={56} h={40} y={106} c="#4a3a7a" />
        <Tower x={50} y={96} w={20} h={56} c="#c8bfe8" />
        <path d="M36 44L44 38L50 44L56 38L64 44L58 52L42 52Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth=".5" transform="translate(6 -14) rotate(14 50 44)" />
        <Bolt x={72} y={14} s={1.5} />
        {[44, 56].map((x) => <rect key={x} x={x - 2} y={60} width="4" height="7" rx="2" fill="#ffd36a" />)}
        <path d="M44 66l-6 8l4 2l-4 8M58 70l6 6l-4 2l5 6" stroke="#ff7a3a" strokeWidth="1.6" fill="none" />
        <Fig x={22} y={46} s={0.5} robe="#d3392f" arms="none" hem={12} />
        <Fig x={80} y={56} s={0.5} robe="#4a63c8" arms="none" hem={12} />
        {[16, 24, 78, 86].map((x, i) => <circle key={i} cx={x} cy={30 + (i % 2) * 16} r="1.6" fill="#ffb84a" />)}
      </>
    ),
  }),
  17: () => ({
    sky: ["#0e1a50", "#3a6ad0"],
    draw: (
      <>
        <Star cx={50} cy={26} r={11} n={8} k={0.4} />
        {[[24, 36], [76, 36], [16, 58], [84, 58], [28, 18], [72, 18], [50, 50]].map(([x, y], i) => <Star key={i} cx={x} cy={y} r={3.2} n={8} k={0.4} fill={GOLD_LIGHT} />)}
        <Ground y={90} c="#1a3a6a" c2="#2a5a8a" />
        <Sea y={92} c="#1a6aa0" />
        <g transform="translate(48 56)">
          <path d="M-3 0H4L10 14L12 30L-6 30Z" fill={SKIN} stroke="#c9a67f" strokeWidth=".3" />
          <circle cx="0" cy="-5" r="4" fill={SKIN} />
          <path d="M-4 -5Q-14 4 -8 24" stroke="#e8c53a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M-4 -5a4 4 0 0 1 8 0Z" fill="#e8c53a" />
        </g>
        <Cup x={32} y={74} s={0.8} r={-35} /><Cup x={64} y={80} s={0.8} r={35} />
        <path d="M30 80Q24 90 22 96M66 86Q74 90 80 96" stroke="#9fe3ff" strokeWidth="1.2" fill="none" />
      </>
    ),
  }),
  18: () => ({
    sky: ["#0e1040", "#4a3aa0"],
    draw: (
      <>
        <circle cx="50" cy="32" r="18" fill={GOLD} opacity=".18" />
        <circle cx="50" cy="32" r="12" fill={SILVER} />
        <path d="M44 28Q50 24 56 28M46 40Q50 44 54 40" stroke="#8d86b8" fill="none" strokeWidth=".8" />
        <circle cx="46" cy="30" r="1" fill="#8d86b8" /><circle cx="54" cy="30" r="1" fill="#8d86b8" />
        {Array.from({ length: 12 }).map((_, i) => <line key={i} x1={50 + Math.cos(i * 0.52) * 18} y1={32 + Math.sin(i * 0.52) * 18} x2={50 + Math.cos(i * 0.52) * 23} y2={32 + Math.sin(i * 0.52) * 23} stroke={GOLD} strokeWidth=".8" />)}
        <Tower x={18} y={90} w={10} h={30} c="#8a78c0" /><Tower x={82} y={90} w={10} h={30} c="#8a78c0" />
        <path d="M44 112Q50 96 50 88Q50 78 56 70" stroke="#d8c8ff" strokeWidth="6" fill="none" opacity=".7" />
        <Dog x={30} y={82} s={0.9} c="#e8e0ff" /><Dog x={70} y={82} s={0.9} flip c="#8a8aa0" />
        <ellipse cx="50" cy="104" rx="16" ry="5" fill="#2a6aa0" />
        <path d="M46 102q4 -6 8 0M44 100l-2 -3M56 100l2 -3" stroke="#ff8a5a" strokeWidth="1.4" fill="none" />
      </>
    ),
  }),
  19: () => ({
    sky: ["#3a2a8a", "#f5c060"],
    draw: (
      <>
        <Sun cx={50} cy={30} r={13} rays={16} face />
        <rect x="8" y="64" width="84" height="12" fill="#c8b8e8" stroke={GOLD} strokeWidth=".4" />
        {[16, 30, 44, 58, 72, 84].map((x) => <g key={x}><line x1={x} y1="112" x2={x} y2="82" stroke="#5a8a3a" strokeWidth="1" /><circle cx={x} cy="80" r="4.4" fill={GOLD} stroke="#c9801a" strokeWidth=".6" /><circle cx={x} cy="80" r="1.8" fill="#6a3a1a" /></g>)}
        <Horse x={50} y={96} s={0.8} c="#f6f2ff" />
        <circle cx="50" cy="70" r="3.4" fill={SKIN} />
        <path d="M46.6 70a3.4 3.4 0 0 1 6.8 0Z" fill="#e8c53a" />
        <path d="M45 68l-3 -5M55 68l3 -5" stroke={ROSE} strokeWidth="1" />
        <path d="M47 74H53V82H47Z" fill="#fff" />
        <path d="M54 74L66 66" stroke={ROSE} strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  }),
  20: () => ({
    sky: ["#2a1a6a", "#d8a8e0"],
    draw: (
      <>
        <Cloud x={24} y={36} s={1.4} /><Cloud x={78} y={34} s={1.4} /><Cloud x={50} y={48} s={1.2} />
        {Array.from({ length: 9 }).map((_, i) => <line key={i} x1="50" y1="30" x2={20 + i * 7.5} y2="86" stroke={GOLD} strokeWidth=".5" opacity=".6" />)}
        <Wing x={44} y={28} s={1.4} flip /><Wing x={56} y={28} s={1.4} />
        <Fig x={50} y={26} s={0.9} robe="#f4eaff" trim={GOLD} arms="out" hem={20} />
        <path d="M54 34L72 28L72 36Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth=".4" />
        <path d="M72 26L80 22L80 42L72 38Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth=".4" />
        <Mount x={14} w={30} h={30} y={100} c="#9a88d8" /><Mount x={88} w={30} h={30} y={100} c="#9a88d8" />
        <path d="M8 100H92V112H8Z" fill="#3a63a0" />
        {[28, 50, 72].map((x) => (
          <g key={x}>
            <rect x={x - 8} y="92" width="16" height="8" rx="1" fill="#e6dcff" stroke={GOLD} strokeWidth=".4" />
            <Fig x={x} y={74} s={0.6} robe="#d8d8e8" arms="up" hem={14} skin="#e8e0f0" hair="#8a8aa0" />
          </g>
        ))}
      </>
    ),
  }),
  21: () => ({
    sky: ["#2a1a6a", "#8a58d0"],
    draw: (
      <>
        <Stars id={21} />
        <ellipse cx="50" cy="62" rx="26" ry="38" fill="none" stroke={LEAF} strokeWidth="4" />
        <ellipse cx="50" cy="62" rx="26" ry="38" fill="none" stroke="#2a8a5a" strokeWidth="1" strokeDasharray="3 2" />
        <path d="M44 24h12v4H44zM44 96h12v4H44z" fill={ROSE} />
        <Fig x={50} y={46} s={1} robe="#c8a8ff" trim={GOLD} arms="out" hem={28} />
        <path d="M44 66Q50 74 58 62" stroke="#fff" strokeWidth="2" fill="none" />
        <line x1="36" y1="52" x2="30" y2="48" stroke={WOOD} strokeWidth="1.2" /><line x1="64" y1="52" x2="70" y2="48" stroke={WOOD} strokeWidth="1.2" />
        <g fill={GOLD} stroke={GOLD_DARK} strokeWidth=".3">
          <circle cx="14" cy="22" r="5" fill="#f4eaff" /><path d="M86 18l-6 8h12z" fill="#d8a050" /><circle cx="14" cy="102" r="5" fill="#d8a050" /><path d="M86 98l4 4l-4 4l-4 -4z" fill="#4aa89a" />
        </g>
      </>
    ),
  }),
};

/* Per-card minor scenes. n = rank 1..10 within suit. */
const spread = (n: number, cx: number, cy: number, rx: number, ry: number, start = -90, end = 270): [number, number, number][] =>
  Array.from({ length: n }).map((_, i) => {
    const a = ((start + ((end - start) * i) / Math.max(1, n - (end - start >= 360 ? 0 : 1))) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a), (a * 180) / Math.PI + 90];
  });
const minorScene = (suit: Suit, n: number): React.ReactNode => {
  const E = (props: P, k: number | string) => <Emblem key={k} suit={suit} {...props} />;

  if (n === 1) {
    return (
      <>
        <Hand x={76} y={84} flip />
        <circle cx="50" cy="52" r="24" fill={GOLD} opacity=".14" />
        {E({ x: 50, y: 52, s: 2.2 }, 0)}
        <Hand x={30} y={104} s={1.1} />
        {suit === "pentacles" && <Ground y={100} c="#244a24" c2="#3a6a2a" />}
        {suit === "cups" && <>{[34, 50, 66].map((x) => <path key={x} d={`M${x} 82q-2 6 0 12`} stroke="#9fe3ff" strokeWidth="1" fill="none" />)}<Sea y={96} /></>}
        {suit === "wands" && [28, 72].map((x) => <path key={x} d={`M${x} 78l3 -5l3 5z`} fill={LEAF} />)}
        {suit === "swords" && <path d="M44 28l3 -6l3 4l3 -4l3 6Z" fill={GOLD} transform="translate(0 -8)" />}
      </>
    );
  }
  const bg: Record<string, React.ReactNode> = {
    "wands2": <><Ground y={90} /><circle cx="50" cy="48" r="7" fill="#5aa0d0" stroke={GOLD} strokeWidth=".6" /><Fig x={50} y={52} s={0.7} robe="#c44a2f" arms="down" hem={22} /></>,
    "wands3": <><Sea y={78} c="#8a5a6a" /><path d="M30 78l6 -14l6 14zM64 78l5 -12l5 12z" fill="#f4eaff" /><Fig x={50} y={46} s={0.8} robe="#c44a2f" arms="none" hem={26} /></>,
    "wands4": <><path d="M26 34Q50 54 74 34" stroke={ROSE} strokeWidth="2" fill="none" /><path d="M26 34Q50 54 74 34" stroke={LEAF} strokeWidth="1" fill="none" strokeDasharray="2 2" /><Tower x={50} y={96} w={26} h={16} c="#c8b8e8" /><Ground y={100} /></>,
    "wands5": <><Ground y={96} />{[[30, 60], [70, 60], [34, 86], [66, 86], [50, 72]].map(([x, y], i) => <Fig key={i} x={x} y={y - 12} s={0.55} robe={["#d33a3a", "#3a9a6a", "#e0b03a", "#4a63c8", "#a85ab0"][i]} arms="up" hem={14} />)}</>,
    "wands6": <><Ground y={96} /><path d="M24 40Q50 22 76 40" stroke={LEAF} strokeWidth="2.4" fill="none" /><Horse x={50} y={86} s={0.8} walk /><Fig x={50} y={52} s={0.7} robe="#e0b03a" arms="up" hem={14} hat="crown" /></>,
    "wands7": <><Mount x={50} w={60} h={34} y={96} c="#a88ad8" /><Fig x={50} y={42} s={0.95} robe="#e0b03a" arms="up" hem={26} /></>,
    "wands8": <><Sea y={92} c="#2a6aa0" /><Mount x={78} w={34} h={24} y={92} c="#a88ad8" /><path d="M12 30q10 -8 20 0" stroke="#fff" fill="none" strokeWidth="1" opacity=".6" /></>,
    "wands9": <><Ground y={98} /><Fig x={50} y={44} s={1} robe="#c44a2f" arms="down" hem={32} /><rect x="42" y="38" width="16" height="3.4" fill="#fff" transform="rotate(-8 50 40)" /></>,
    "wands10": <><Ground y={100} /><Tower x={80} y={100} w={14} h={16} c="#c8b8e8" /><Fig x={46} y={56} s={0.95} robe="#c44a2f" arms="up" hem={30} /></>,
    "cups2": <><Ground y={98} /><Fig x={32} y={52} s={0.8} robe="#4a63c8" arms="out" hem={26} /><Fig x={68} y={52} s={0.8} robe="#c4488a" arms="out" hem={26} /><path d="M50 28v22M44 32h12" stroke={GOLD} strokeWidth="1.4" /><Wing x={48} y={30} s={0.5} flip /><Wing x={52} y={30} s={0.5} /></>,
    "cups3": <><Ground y={96} />{[[30, 56, "#e0709a"], [70, 56, "#7a8ae0"], [50, 62, "#e0b03a"]].map(([x, y, c], i) => <Fig key={i} x={x as number} y={(y as number) - 8} s={0.7} robe={c as string} arms="up" hem={24} />)}{[22, 78, 38, 62].map((x, i) => <circle key={i} cx={x} cy={96 + (i % 2) * 6} r="2.4" fill={i % 2 ? "#ff9a3c" : "#e0b03a"} />)}</>,
    "cups4": <><Ground y={92} /><path d="M26 92V54" stroke="#5b3a1a" strokeWidth="5" /><circle cx="26" cy="40" r="16" fill="#2a8a5a" /><Fig x={46} y={66} s={0.85} robe="#b04a4a" arms="down" hem={24} /><Hand x={80} y={46} flip /></>,
    "cups5": <><Sea y={92} /><path d="M8 78H92" stroke="#8a5a2a" strokeWidth="2" /><Fig x={50} y={44} s={1} robe="#14143a" trim="#5b3a7a" arms="down" hem={34} /><path d="M20 98V78M80 98V78" stroke="#8a5a2a" strokeWidth="2" /><path d="M10 78H34" stroke="#5b3a1a" strokeWidth="3" /></>,
    "cups6": <><Ground y={98} /><Tower x={78} y={92} w={14} h={30} c="#e6dcff" /><Fig x={36} y={56} s={0.6} robe="#e07a50" arms="down" hem={20} /><Fig x={56} y={66} s={0.5} robe="#4a63c8" arms="down" hem={16} />{[22, 34, 46, 58, 70].map((x) => <circle key={x} cx={x} cy={96} r="1.6" fill="#fff" />)}</>,
    "cups7": <><Sea y={96} c="#18305a" />{[[22, 28], [50, 24], [78, 28], [30, 56], [70, 56], [50, 54]].map(([x, y], i) => <Cloud key={i} x={x} y={y + 8} s={0.9} />)}<Fig x={50} y={78} s={0.5} robe="#14143a" arms="none" hem={14} /></>,
    "cups8": <><Mount x={30} w={50} h={46} y={100} c="#8a68d0" /><Mount x={70} w={44} h={38} y={100} c="#8a68d0" /><Moon cx={50} cy={36} r={10} fill={GOLD_LIGHT} /><Sea y={100} /><Fig x={74} y={64} s={0.7} robe="#c44a2f" arms="down" hem={24} /></>,
    "cups9": <><rect x="10" y="64" width="80" height="4" fill="#5b3a1a" /><path d="M8 40H92V64H8Z" fill="#3a1a60" opacity=".7" /><Fig x={50} y={78} s={0.8} robe="#e0b03a" arms="out" hem={24} /></>,
    "cups10": <><Sun cx={50} cy={32} r={0.1} rays={0} /><path d="M8 62A42 36 0 0 1 92 62" stroke="#ff7a7a" strokeWidth="2.6" fill="none" /><path d="M12 62A38 32 0 0 1 88 62" stroke="#ffd36a" strokeWidth="2.6" fill="none" /><path d="M16 62A34 28 0 0 1 84 62" stroke="#7affb0" strokeWidth="2.6" fill="none" /><path d="M20 62A30 24 0 0 1 80 62" stroke="#7ab0ff" strokeWidth="2.6" fill="none" /><Ground y={98} /><Tower x={82} y={96} w={14} h={14} c="#e6dcff" /><Fig x={36} y={76} s={0.6} robe="#c44a2f" arms="up" hem={20} /><Fig x={52} y={76} s={0.6} robe="#4a63c8" arms="up" hem={20} /><Fig x={26} y={88} s={0.4} robe="#e0b03a" arms="up" hem={10} /><Fig x={62} y={88} s={0.4} robe="#c4488a" arms="up" hem={10} /></>,
    "swords2": <><Sea y={84} c="#18305a" /><Moon cx={74} cy={26} r={6} /><rect x="38" y="70" width="24" height="5" fill="#e6dcff" /><Fig x={50} y={44} s={0.85} robe="#f4eaff" arms="up" hem={28} /><rect x="45" y="42" width="10" height="2.4" fill="#fff" /></>,
    "swords3": <><Rain n={22} /><Cloud x={30} y={32} s={1.6} fill="#5a5a8a" /><Cloud x={70} y={34} s={1.6} fill="#5a5a8a" /><Cloud x={50} y={40} s={1.4} fill="#6a6a9a" /></>,
    "swords4": <><path d="M24 16h52v50H24Z" fill="#2a2a6a" stroke={GOLD} strokeWidth=".6" /><Fig x={50} y={36} s={0.6} robe="#d8a8ff" arms="out" hem={16} /><rect x="14" y="86" width="72" height="12" rx="2" fill="#c8c0e8" stroke={GOLD} strokeWidth=".5" /><rect x="22" y="76" width="56" height="10" rx="5" fill="#e6dcff" /><circle cx="26" cy="81" r="3.2" fill={SKIN} /></>,
    "swords5": <><Sea y={92} c="#18305a" /><Cloud x={26} y={28} s={1.3} fill="#8a78c0" /><Cloud x={74} y={24} s={1.3} fill="#8a78c0" /><Fig x={28} y={62} s={0.65} robe="#4a63c8" arms="none" hem={26} /><Fig x={74} y={66} s={0.65} robe="#c44a2f" arms="none" hem={26} /><Fig x={52} y={50} s={0.8} robe="#3a9a6a" arms="down" hem={30} /></>,
    "swords6": <><Sea y={72} c="#1a4a7a" /><path d="M20 82Q50 92 80 82L74 92H26Z" fill="#8a5a2a" stroke={GOLD} strokeWidth=".5" /><Fig x={44} y={58} s={0.7} robe="#6a6a9a" arms="none" hem={20} /><Fig x={56} y={64} s={0.5} robe="#4a63c8" arms="none" hem={14} /><path d="M10 54l82 0" stroke="none" /></>,
    "swords7": <><rect x="8" y="64" width="26" height="30" fill="#c43d3d" opacity=".6" /><path d="M8 64L21 48L34 64Z" fill="#e8d6ff" /><Ground y={100} /><Fig x={66} y={54} s={0.9} robe="#e0b03a" arms="out" hem={30} hat="cap" /></>,
    "swords8": <><Mount x={78} w={40} h={36} y={92} c="#8a68d0" /><Sea y={96} c="#1a3a6a" /><rect x="8" y="94" width="84" height="6" fill="#3a2a5a" /><Fig x={50} y={56} s={0.85} robe="#f4eaff" arms="none" hem={30} /><rect x="42" y="50" width="16" height="3" fill="#c43d3d" /></>,
    "swords9": <><rect x="8" y="14" width="84" height="94" fill="#0e0a22" opacity=".5" /><rect x="14" y="78" width="72" height="26" fill="#5b3a7a" stroke={GOLD} strokeWidth=".5" /><Fig x={50} y={44} s={0.95} robe="#f4eaff" arms="up" hem={36} /><circle cx="54" cy="44" r="0" /></>,
    "swords10": <><Stars id={60} /><Sea y={90} c="#18305a" /><path d="M8 90Q50 76 92 90V112H8Z" fill="#c8a870" opacity=".5" /><path d="M8 88Q50 80 92 88" stroke="#ffb86a" strokeWidth="4" fill="none" opacity=".7" /><path d="M16 88a34 20 0 0 1 68 0" fill="#ff9a3c" opacity=".35" /><rect x="22" y="76" width="56" height="10" rx="5" fill="#8a4a4a" /><circle cx="28" cy="80" r="3.6" fill={SKIN} /></>,
    "pentacles2": <><Sea y={78} c="#1a4a7a" /><path d="M12 78Q30 60 50 78T88 78" stroke={GOLD} strokeWidth=".8" fill="none" /><path d="M20 82q5 -8 10 0M60 84q5 -8 10 0" stroke="#fff" fill="none" strokeWidth=".8" /><Fig x={50} y={40} s={0.9} robe="#c44a2f" arms="out" hem={28} hat="cap" /><path d="M32 54C32 46 50 46 50 54C50 62 68 62 68 54C68 46 50 46 50 54C50 62 32 62 32 54Z" fill="none" stroke={GOLD} strokeWidth="1.4" /></>,
    "pentacles3": <><Arch x={50} y={104} w={64} h={84} c="#d9cff5" /><rect x="32" y="62" width="36" height="5" fill="#8a5a2a" /><Fig x={50} y={56} s={0.55} robe="#4a63c8" arms="up" hem={14} /><Fig x={28} y={80} s={0.6} robe="#e0b03a" arms="none" hem={20} /><Fig x={72} y={80} s={0.6} robe="#c44a2f" arms="none" hem={20} /></>,
    "pentacles4": <><Ground y={92} /><Tower x={80} y={72} w={12} h={22} c="#c8b8e8" /><rect x="34" y="66" width="32" height="10" rx="1" fill="#8a5a2a" /><Fig x={50} y={36} s={1} robe="#8a3a5a" arms="down" hem={28} hat="crown" /></>,
    "pentacles5": <><rect x="8" y="14" width="84" height="94" fill="#0e1a2a" opacity=".5" /><path d="M54 22h34v46H54Z" fill="#e0b03a" opacity=".35" stroke={GOLD} strokeWidth=".6" /><path d="M60 68V30Q71 18 82 30V68" stroke={GOLD} fill="none" strokeWidth=".8" />{Array.from({ length: 18 }).map((_, i) => <circle key={i} cx={10 + ((i * 17) % 80)} cy={18 + ((i * 29) % 80)} r="1" fill="#fff" />)}<Fig x={26} y={66} s={0.7} robe="#6a6a8a" arms="none" hem={22} /><Fig x={44} y={84} s={0.6} robe="#8a6a5a" arms="none" hem={14} /></>,
    "pentacles6": <><Ground y={98} /><path d="M38 28h24M50 28v10M38 38h-4l-6 12h16zM62 38h4l6 12H56z" stroke={GOLD} strokeWidth="1" fill="none" /><Fig x={50} y={58} s={0.8} robe="#e0b03a" arms="out" hem={30} /><Fig x={26} y={84} s={0.45} robe="#6a6a8a" arms="up" hem={10} /><Fig x={74} y={84} s={0.45} robe="#6a6a8a" arms="up" hem={10} /></>,
    "pentacles7": <><Ground y={96} /><path d="M20 90Q30 56 50 60Q70 56 80 90Z" fill="#2a7a4a" /><Fig x={24} y={58} s={0.7} robe="#c44a2f" arms="down" hem={30} /></>,
    "pentacles8": <><Ground y={100} /><rect x="30" y="72" width="40" height="6" fill="#8a5a2a" /><rect x="34" y="78" width="4" height="22" fill="#8a5a2a" /><rect x="62" y="78" width="4" height="22" fill="#8a5a2a" /><Fig x={28} y={44} s={0.8} robe="#6a8aa8" arms="down" hem={28} hat="cap" /><path d="M36 58l8 6" stroke={SILVER} strokeWidth="1.4" /><Tower x={84} y={92} w={10} h={14} c="#c8b8e8" /></>,
    "pentacles9": <><Ground y={96} /><path d="M10 100V30M90 100V30" stroke="#5a3a1a" strokeWidth="1.2" />{[[16, 40], [22, 60], [84, 40], [78, 62]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#8a3a7a" />)}<Fig x={50} y={44} s={1.05} robe="#e0b03a" arms="down" hem={36} /><path d="M70 62l4 -2l4 2l-2 4z" fill="#d8a050" /></>,
    "pentacles10": <><Arch x={50} y={106} w={72} h={90} c="#d9cff5" /><Fig x={50} y={74} s={0.6} robe="#6a8aa8" arms="down" hem={22} hair="#d8d8e8" /><Fig x={72} y={84} s={0.45} robe="#c44a2f" arms="down" hem={14} /><Dog x={30} y={98} s={0.8} c="#e8e0ff" /><Dog x={36} y={94} s={0.6} c="#8a8aa0" /></>,
  };
  const key = `${suit}${n}`;
  const bgNode = bg[key];

  let items: React.ReactNode = null;
  if (suit === "wands") {
    if (n === 2) items = <>{E({ x: 28, y: 56, s: 1.7 }, 0)}{E({ x: 72, y: 56, s: 1.7 }, 1)}</>;
    else if (n === 3) items = <>{E({ x: 28, y: 52, s: 1.5 }, 0)}{E({ x: 50, y: 52, s: 1.5 }, 1)}{E({ x: 72, y: 52, s: 1.5 }, 2)}</>;
    else if (n === 4) items = <>{E({ x: 26, y: 62, s: 1.7 }, 0)}{E({ x: 74, y: 62, s: 1.7 }, 1)}{E({ x: 38, y: 74, s: 1.1 }, 2)}{E({ x: 62, y: 74, s: 1.1 }, 3)}</>;
    else if (n === 5) items = spread(5, 50, 52, 30, 18, -160, -20).map(([x, y, r], i) => E({ x, y, r: r - 90 + (i % 2 ? 24 : -24), s: 1.1 }, i));
    else if (n === 6) items = <>{E({ x: 50, y: 56, s: 1.6 }, 0)}{[22, 78].map((x, i) => E({ x, y: 66, s: 1.1, r: i ? 14 : -14 }, `a${i}`))}{[34, 66].map((x, i) => E({ x, y: 72, s: 1, r: i ? 8 : -8 }, `b${i}`))}{E({ x: 50, y: 74, s: 1 }, "c")}</>;
    else if (n === 7) items = <>{E({ x: 70, y: 44, s: 1.8, r: 8 }, 0)}{[22, 32, 42, 52, 62, 72].map((x, i) => E({ x: 14 + i * 14, y: 86, s: 0.9, r: -20 + i * 8 }, `s${i}`))}</>;
    else if (n === 8) items = Array.from({ length: 8 }).map((_, i) => E({ x: 24 + i * 7.5, y: 34 + i * 7, s: 1.1, r: 52 }, i));
    else if (n === 9) items = <>{[14, 24, 76, 86].map((x, i) => E({ x, y: 80, s: 1.4 }, i))}{E({ x: 66, y: 62, s: 1.5 }, 9)}{E({ x: 34, y: 62, s: 1.5 }, 10)}</>;
    else items = <>{Array.from({ length: 10 }).map((_, i) => E({ x: 24 + i * 5.8, y: 66 + (i % 2) * 2, s: 1, r: -10 + i * 2 }, i))}</>;
  } else if (suit === "cups") {
    if (n === 2) items = <>{E({ x: 34, y: 66, s: 1.3, r: 10 }, 0)}{E({ x: 66, y: 66, s: 1.3, r: -10 }, 1)}</>;
    else if (n === 3) items = <>{E({ x: 28, y: 36, s: 1.2, r: -12 }, 0)}{E({ x: 50, y: 30, s: 1.2 }, 1)}{E({ x: 72, y: 36, s: 1.2, r: 12 }, 2)}</>;
    else if (n === 4) items = <>{E({ x: 54, y: 84, s: 1 }, 0)}{E({ x: 66, y: 84, s: 1 }, 1)}{E({ x: 60, y: 74, s: 1 }, 2)}</>;
    else if (n === 5) items = <>{[28, 40, 52].map((x, i) => E({ x, y: 90, s: 0.9, r: 80 + i * 10 }, i))}{E({ x: 70, y: 84, s: 1.1 }, 3)}{E({ x: 84, y: 84, s: 1.1 }, 4)}</>;
    else if (n === 6) items = <>{[[26, 90], [42, 90], [58, 90], [30, 80], [46, 80], [62, 80]].map(([x, y], i) => E({ x, y, s: 0.8 }, i))}</>;
    else if (n === 7) items = <>{[[22, 28], [50, 24], [78, 28], [30, 56], [70, 56], [50, 54], [50, 40]].map(([x, y], i) => E({ x, y: y + 4, s: i === 6 ? 1.5 : 0.8 }, i))}</>;
    else if (n === 8) items = <>{[[20, 90], [28, 90], [36, 90], [20, 80], [28, 80], [36, 80], [24, 70], [32, 70]].map(([x, y], i) => E({ x, y, s: 0.7 }, i))}</>;
    else if (n === 9) items = <>{Array.from({ length: 9 }).map((_, i) => E({ x: 14 + i * 9, y: 58, s: 0.75 }, i))}</>;
    else items = <>{[[36, 36], [64, 36], [50, 28], [50, 44], [30, 52], [70, 52], [24, 44], [76, 44], [40, 28], [60, 28]].slice(0, 10).map(([x, y], i) => E({ x, y: y - 6, s: 0.62 }, i))}</>;
  } else if (suit === "swords") {
    if (n === 2) items = <>{E({ x: 50, y: 52, s: 1.8, r: -40 }, 0)}{E({ x: 50, y: 52, s: 1.8, r: 40 }, 1)}</>;
    else if (n === 3) items = <><Heart x={50} y={58} s={2.8} />{E({ x: 50, y: 56, s: 2.2, r: 0 }, 0)}{E({ x: 50, y: 56, s: 2, r: 60 }, 1)}{E({ x: 50, y: 56, s: 2, r: -60 }, 2)}</>;
    else if (n === 4) items = <>{[40, 50, 60].map((x, i) => E({ x, y: 36, s: 1, r: 0 }, i))}{E({ x: 50, y: 62, s: 1.4, r: 90 }, 3)}</>;
    else if (n === 5) items = <>{E({ x: 50, y: 74, s: 1.7, r: 70 }, 0)}{E({ x: 24, y: 64, s: 1.2, r: -20 }, 1)}{E({ x: 78, y: 70, s: 1.2, r: 30 }, 2)}{E({ x: 36, y: 90, s: 1.2, r: 100 }, 3)}{E({ x: 66, y: 94, s: 1.2, r: -80 }, 4)}</>;
    else if (n === 6) items = <>{[40, 46, 52, 58, 64, 70].map((x, i) => E({ x, y: 56, s: 1.15 }, i))}</>;
    else if (n === 7) items = <>{[[40, 66], [46, 66]].map(([x, y], i) => E({ x, y, s: 1.3, r: i ? 6 : -6 }, i))}{[[54, 44], [60, 44], [66, 44], [72, 44], [78, 44]].map(([x, y], i) => E({ x, y: y + 14, s: 0.9, r: 14 }, `b${i}`))}</>;
    else if (n === 8) items = <>{[22, 32, 42, 58, 68, 78].map((x, i) => E({ x, y: 66, s: 1.5 }, i))}{E({ x: 50, y: 40, s: 1, r: 90 }, 8)}{E({ x: 50, y: 92, s: 1, r: 90 }, 9)}</>;
    else if (n === 9) items = <>{Array.from({ length: 9 }).map((_, i) => E({ x: 14 + i * 9, y: 28, s: 0.9 }, i))}</>;
    else items = <>{Array.from({ length: 10 }).map((_, i) => E({ x: 28 + i * 5, y: 66, s: 0.95, r: -70 + i * 3 }, i))}</>;
  } else {
    if (n === 2) items = <>{E({ x: 34, y: 68, s: 1.2 }, 0)}{E({ x: 66, y: 36, s: 1.2 }, 1)}</>;
    else if (n === 3) items = <>{E({ x: 50, y: 28, s: 1 }, 0)}{E({ x: 30, y: 86, s: 0.9 }, 1)}{E({ x: 70, y: 86, s: 0.9 }, 2)}</>;
    else if (n === 4) items = <>{E({ x: 50, y: 62, s: 1.1 }, 0)}{E({ x: 34, y: 28, s: 0.9 }, 1)}{E({ x: 66, y: 28, s: 0.9 }, 2)}{E({ x: 50, y: 100, s: 0.9 }, 3)}</>;
    else if (n === 5) items = <>{[[28, 32], [50, 32], [72, 32], [40, 54], [60, 54]].map(([x, y], i) => E({ x, y, s: 0.6 }, i))}</>;
    else if (n === 6) items = <>{[[24, 42], [38, 38], [76, 42], [62, 38], [30, 52], [70, 52]].map(([x, y], i) => E({ x, y, s: 0.7 }, i))}</>;
    else if (n === 7) items = <>{[[66, 62], [76, 56], [76, 70], [56, 54], [86, 62], [66, 76], [58, 68]].map(([x, y], i) => E({ x, y, s: 0.6 }, i))}</>;
    else if (n === 8) items = <>{[[70, 26], [70, 50], [70, 74], [86, 38], [86, 62], [54, 38], [54, 62], [38, 30]].slice(0, 8).map(([x, y], i) => E({ x, y, s: 0.65 }, i))}</>;
    else if (n === 9) items = <>{[[20, 52], [30, 70], [78, 52], [70, 70], [48, 28], [24, 36], [76, 34], [50, 98], [14, 64]].map(([x, y], i) => E({ x, y, s: 0.65 }, i))}</>;
    else items = <>{[[50, 28], [34, 36], [66, 36], [40, 52], [60, 52], [50, 44], [24, 66], [76, 66], [36, 100], [64, 100]].map(([x, y], i) => E({ x, y, s: 0.6 }, i))}</>;
  }
  return (
    <>
      {bgNode}
      {items}
    </>
  );
};

const courtScene = (suit: Suit, rank: number): React.ReactNode => {
  const robe = { wands: "#d8602f", cups: "#3a73d0", swords: "#7a8ab0", pentacles: "#3a9a5a" }[suit];
  const back =
    suit === "wands" ? <><Mount x={20} w={34} h={26} y={96} c="#e0a050" /><Mount x={82} w={34} h={20} y={96} c="#e0a050" /><Sun cx={76} cy={26} r={5} /></> :
    suit === "cups" ? <><Sea y={84} c="#1a5a8a" /><Moon cx={22} cy={26} r={5} /></> :
    suit === "swords" ? <><Cloud x={22} y={30} s={1.3} fill="#8a9ad0" /><Cloud x={78} y={24} s={1.3} fill="#8a9ad0" /><Wing x={10} y={50} s={0.5} /></> :
    <><Ground y={92} c="#244a24" c2="#3a6a2a" />{[16, 84].map((x) => <circle key={x} cx={x} cy={80} r="4" fill="#8a3a7a" />)}</>;
  const E = (p: P) => <Emblem suit={suit} {...p} />;
  if (rank === 0)
    return <>{back}<Ground y={98} c="#2a1a5a" c2="#3b2480" /><Fig x={50} y={44} s={1.1} robe={robe} arms="up" hem={34} hat="cap" /><g>{E({ x: 62, y: 29, s: 0.9 })}</g></>;
  if (rank === 1)
    return <>{back}<Ground y={98} /><Horse x={46} y={86} s={0.9} walk /><Fig x={46} y={50} s={0.95} robe={robe} trim={SILVER} arms="up" hem={16} hat="crown" /><g>{E({ x: 58, y: 36, s: 0.9, r: 12 })}</g></>;
  const tall = rank === 3;
  return (
    <>
      {back}
      <rect x="24" y={tall ? 14 : 20} width="52" height={tall ? 92 : 86} rx="5" fill="#2a1a5a" stroke={GOLD} strokeWidth=".7" />
      <path d={`M24 ${tall ? 14 : 20}Q50 ${tall ? 2 : 8} 76 ${tall ? 14 : 20}`} fill="none" stroke={GOLD} strokeWidth="1.2" />
      <Fig x={50} y={tall ? 36 : 40} s={1.3} robe={robe} trim={GOLD} arms="down" hem={36} hat="crown" />
      {tall && <path d="M40 28l-2 -8l6 4l6 -8l6 8l6 -4l-2 8Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth=".4" />}
      <g>{E({ x: 61, y: 64, s: 1.0 })}</g>
      {rank === 3 && <line x1="30" y1="46" x2="30" y2="92" stroke={GOLD} strokeWidth="1.6" />}
      {rank === 2 && <path d="M36 104Q50 98 64 104" stroke={ROSE} fill="none" strokeWidth="1.2" />}
    </>
  );
};

const resolveScene = (id: number): Scene => {
  if (MAJOR[id]) return MAJOR[id]();
  const idx = id - 22;
  const suit = SUITS[Math.floor(idx / 14)];
  const k = idx % 14;
  if (!suit) return { sky: ["#2a1a5a", "#5b34a8"], draw: <Star cx={50} cy={60} r={24} n={8} k={0.4} /> };
  const sky = MINOR_SKY[suit];
  const night = suit === "swords" && k === 9;
  return { sky: night ? ["#1b1a4a", "#a0482c"] : sky, draw: k < 10 ? minorScene(suit, k + 1) : courtScene(suit, k - 10) };
};

const NEB: Record<string, [string, string, string]> = {
  major: ["#b02ad8", "#2a5be0", "#ff4fa0"],
  wands: ["#ff5a2a", "#c01a6a", "#ffb02a"],
  cups: ["#14b8d8", "#3a4ae0", "#a02ad8"],
  swords: ["#5a5af0", "#b02ad8", "#14c8e8"],
  pentacles: ["#14c88a", "#2a8ae0", "#e8b02a"],
};

const Defs = () => (
  <>
    <linearGradient id="mmGoldV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff2b8" /><stop offset=".45" stopColor="#ffc93c" /><stop offset="1" stopColor="#a8650c" />
    </linearGradient>
    <linearGradient id="mmGoldFrame" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="150">
      <stop offset="0" stopColor="#fff2b8" /><stop offset=".35" stopColor="#e8a82a" /><stop offset=".65" stopColor="#fff0a0" /><stop offset="1" stopColor="#b8730e" />
    </linearGradient>
    <linearGradient id="mmSteel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#9aa4d8" /><stop offset=".5" stopColor="#ffffff" /><stop offset="1" stopColor="#7a84c0" />
    </linearGradient>
    <linearGradient id="mmWood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#7a4a14" /><stop offset=".5" stopColor="#d89a40" /><stop offset="1" stopColor="#5a3210" />
    </linearGradient>
    <linearGradient id="mmLeaf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#7af0a0" /><stop offset="1" stopColor="#0a8a5a" />
    </linearGradient>
    <linearGradient id="mmShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
    </linearGradient>
    <linearGradient id="mmShadeV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
    </linearGradient>
    <linearGradient id="mmGroundShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffb86a" stopOpacity=".28" /><stop offset=".5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
    </linearGradient>
    <radialGradient id="mmHalo">
      <stop offset="0" stopColor="#fff2b8" stopOpacity=".7" /><stop offset="1" stopColor="#ffc93c" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="mmAura">
      <stop offset="0" stopColor="#fff2d8" stopOpacity=".38" /><stop offset=".6" stopColor="#d89aff" stopOpacity=".12" /><stop offset="1" stopColor="#d89aff" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="mmFlame">
      <stop offset="0" stopColor="#fff3a0" stopOpacity=".9" /><stop offset=".5" stopColor="#ff8a2a" stopOpacity=".4" /><stop offset="1" stopColor="#ff4a2a" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="mmCoin" cx=".35" cy=".3" r=".9">
      <stop offset="0" stopColor="#fff6c0" /><stop offset=".5" stopColor="#ffc93c" /><stop offset="1" stopColor="#a8650c" />
    </radialGradient>
    <radialGradient id="mmVignette" cx=".5" cy=".45" r=".75">
      <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#05020f" stopOpacity=".75" />
    </radialGradient>
    <filter id="mmPaint" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feColorMatrix in="d" type="saturate" values="1.45" result="sat" />
      <feComponentTransfer in="sat" result="con">
        <feFuncR type="linear" slope="1.12" intercept="-.04" />
        <feFuncG type="linear" slope="1.12" intercept="-.04" />
        <feFuncB type="linear" slope="1.12" intercept="-.04" />
      </feComponentTransfer>
      <feGaussianBlur in="con" stdDeviation="1.6" result="bl" />
      <feComponentTransfer in="bl" result="bloom"><feFuncA type="linear" slope=".55" /></feComponentTransfer>
      <feBlend in="con" in2="bloom" mode="screen" />
    </filter>
    <filter id="mmGrain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" />
      <feColorMatrix type="matrix" values="0 0 0 0 .6  0 0 0 0 .5  0 0 0 0 .4  0 0 0 .5 0" />
    </filter>
  </>
);

const Atmosphere = ({ id, kind }: { id: number; kind: string }) => {
  const [c1, c2, c3] = NEB[kind];
  const r = (n: number) => ((id * 9301 + n * 49297) % 233280) / 233280;
  return (
    <g>
      <ellipse cx={20 + r(1) * 60} cy={20 + r(2) * 30} rx="38" ry="22" fill={c1} opacity=".38" transform={`rotate(${r(3) * 60 - 30} 50 40)`} />
      <ellipse cx={20 + r(4) * 60} cy={50 + r(5) * 30} rx="34" ry="20" fill={c2} opacity=".36" transform={`rotate(${r(6) * 80 - 40} 50 70)`} />
      <ellipse cx={20 + r(7) * 60} cy={30 + r(8) * 40} rx="22" ry="14" fill={c3} opacity=".3" />
      <g opacity=".09">
        {Array.from({ length: 6 }).map((_, i) => (
          <polygon key={i} points={`50,16 ${-6 + i * 20},112 ${2 + i * 20},112`} fill="#fff4c8" />
        ))}
      </g>
      {Array.from({ length: 5 }).map((_, i) => (
        <circle key={i} cx={10 + r(10 + i) * 80} cy={14 + r(20 + i) * 60} r={1.2 + r(30 + i) * 2.2} fill="#fff4c8" opacity=".25" />
      ))}
    </g>
  );
};

const Backdrop = ({ id, kind }: { id: number; kind: string }) => {
  const r = (n: number) => ((id * 7919 + n * 104729) % 100003) / 100003;
  const hz = 70 + r(1) * 10;
  const haze = kind === "wands" ? "#ff9a5a" : kind === "cups" ? "#6ad0ff" : kind === "swords" ? "#a8b4ff" : kind === "pentacles" ? "#9aff9a" : "#ffb8ff";
  const ridge = (o: number, amp: number, y0: number) => {
    let d = `M8 ${y0}`;
    for (let i = 0; i <= 6; i++) d += `L${8 + i * 14} ${y0 - amp * (0.3 + r(o + i) * 0.7)}`;
    return d + `L92 ${y0}V112H8Z`;
  };
  return (
    <g>
      <ellipse cx={30 + r(2) * 40} cy={hz} rx="46" ry="24" fill={haze} opacity=".32" />
      <circle cx={30 + r(3) * 40} cy={hz - 8} r="16" fill="url(#mmHalo)" />
      <path d={ridge(10, 22, hz + 4)} fill="#6a48b8" opacity=".5" />
      <path d={ridge(20, 14, hz + 10)} fill="#3a2478" opacity=".7" />
      <ellipse cx="22" cy={hz + 9} rx="22" ry="3.4" fill="#ffffff" opacity=".22" />
      <ellipse cx="76" cy={hz + 13} rx="26" ry="3.6" fill="#ffffff" opacity=".18" />
      {Array.from({ length: 8 }).map((_, i) => {
        const cx = 12 + r(40 + i) * 76, cy = 14 + r(50 + i) * 50, k = 1.4 + r(70 + i) * 1.6;
        return <path key={i} d={`M${cx} ${cy - k * 2}L${cx + k * 0.4} ${cy - k * 0.4}L${cx + k * 2} ${cy}L${cx + k * 0.4} ${cy + k * 0.4}L${cx} ${cy + k * 2}L${cx - k * 0.4} ${cy + k * 0.4}L${cx - k * 2} ${cy}L${cx - k * 0.4} ${cy - k * 0.4}Z`} fill="#fff4c8" opacity={0.35 + r(60 + i) * 0.5} />;
      })}
    </g>
  );
};

const ARCH = "M8 112V28Q8 16 20 14Q34 12 42 8Q50 3 58 8Q66 12 80 14Q92 16 92 28V112Z";
const Ornament = () => (
  <g fill="none" stroke="url(#mmGoldFrame)">
    <path d="M4 118V26Q4 12 18 10Q34 8 42 4Q50 -1 58 4Q66 8 82 10Q96 12 96 26V118Q96 124 90 124H10Q4 124 4 118Z" strokeWidth="1.6" />
    <path d={ARCH} strokeWidth="1.1" />
    <path d="M6.4 112V27Q6.4 14 19 12Q34 10 42 6Q50 1 58 6Q66 10 81 12Q93.6 14 93.6 27V112" strokeWidth=".4" />
    <path d="M10 106Q9 98 15 96M90 106Q91 98 85 96M12 24Q14 18 22 17M88 24Q86 18 78 17" strokeWidth=".6" />
    <circle cx="50" cy="6" r="4.4" fill="#1d0b45" strokeWidth=".9" />
    <path d="M50 2.6l1 2.4l2.4 1l-2.4 1l-1 2.4l-1 -2.4l-2.4 -1l2.4 -1Z" fill="url(#mmGoldFrame)" stroke="none" />
    <rect x="9" y="113" width="82" height="25" rx="7" fill="#12082e" stroke="url(#mmGoldFrame)" strokeWidth="1" />
    <rect x="11" y="115" width="78" height="21" rx="5" strokeWidth=".35" />
    <circle cx="50" cy="112.5" r="5.2" fill="#1d0b45" strokeWidth=".9" />
    <path d="M50 108.4l1.2 2.9l2.9 1.2l-2.9 1.2l-1.2 2.9l-1.2 -2.9l-2.9 -1.2l2.9 -1.2Z" fill="url(#mmGoldFrame)" stroke="none" />
    <path d="M12 113Q22 108 30 113M88 113Q78 108 70 113" strokeWidth=".6" />
    <rect x="4" y="124" width="92" height="22" rx="0" fill="none" stroke="none" />
  </g>
);

export default function TarotCardArt({ id, className = "" }: { id: number; className?: string }) {
  const artworkUrl = artworkById.get(Number(id));
  return (
    <div className={`relative overflow-hidden bg-[#05020f] ${className}`} aria-hidden="true">
      <img src={artworkUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMin slice" className="pointer-events-none absolute inset-0 h-full w-full" focusable="false">
        <defs>
          <Defs />
        </defs>
        <Ornament />
      </svg>
    </div>
  );
}
