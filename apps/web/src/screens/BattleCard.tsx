import { useId, useState, type CSSProperties } from "react";
import { RARITIES, SKILL_BY_ID, type CardDefinition, type OwnedCard, type SkillDefinition } from "@gdr/engine";
import { useCardInfoPress } from "./CardTile";

interface Props {
  card: CardDefinition;
  owned?: OwnedCard | undefined;
  /** The big number: DRAW while choosing the leader, POW after (as in the OG). */
  show: "draw" | "pow";
  className?: string;
  onClick?: (() => void) | undefined;
}

// Glyphs, badge, number and stars are lifted from docs/art-samples/og-sample.html.
const DS = { stroke: "#3c3c44" };
const sword = (x: number) => (
  <>
    <path d={`M${x} 25 L${x + 5.5} 32 L${x + 5.5} 55 L${x - 5.5} 55 L${x - 5.5} 32 Z`} />
    <path d={`M${x - 13} 54 Q${x - 15} 57 ${x - 12} 60 L${x + 12} 60 Q${x + 15} 57 ${x + 13} 54 Z`} />
    <rect x={x - 2.8} y="60" width="5.6" height="9" />
    <circle cx={x} cy="71.5" r="3.8" />
    <path d={`M${x} 31 L${x} 52`} {...DS} strokeWidth="1.6" />
    <path d={`M${x - 2.8} 63 H${x + 2.8} M${x - 2.8} 66 H${x + 2.8}`} {...DS} strokeWidth="1.2" />
  </>
);
const arrow = <path d="M37 26 L46 37 L41 37 L41 49 L33 49 L33 37 L28 37 Z" />;
const GLYPH = {
  draw: (
    <>
      <rect x="37" y="28" width="26" height="44" rx="4" />
      <rect x="41" y="32" width="18" height="36" rx="2" fill="none" {...DS} strokeWidth="2.4" />
    </>
  ),
  up: (
    <>
      {sword(57)}
      {arrow}
    </>
  ),
  down: (
    <>
      {sword(57)}
      <g transform="translate(0 75) scale(1 -1)">{arrow}</g>
    </>
  ),
  guard: (
    <>
      <path d="M50 27 L69 33 L69 47 C69 60 61 67 50 73 C39 67 31 60 31 47 L31 33 Z" />
      <path
        d="M50 32.5 L64 37 L64 47 C64 57 58 62.5 50 67 C42 62.5 36 57 36 47 L36 37 Z"
        fill="none"
        {...DS}
        strokeWidth="1.6"
      />
      <path d="M50 39 V61 M41 47 H59" {...DS} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  heal: (
    <>
      <path d="M43 29 H57 V43 H71 V57 H57 V71 H43 V57 H29 V43 H43 Z" />
      <path
        d="M46.5 32.5 H53.5 V46.5 H67.5 V53.5 H53.5 V67.5 H46.5 V53.5 H32.5 V46.5 H46.5 Z"
        fill="none"
        {...DS}
        strokeWidth="1.5"
      />
    </>
  ),
};
type GlyphKey = keyof typeof GLYPH;

/** Which glyph a skill gets; undefined falls back to the skill's first letter. */
function glyphOf(skill: SkillDefinition): GlyphKey | undefined {
  const e = skill.effect;
  switch (e.kind) {
    case "power":
    case "combo":
      return e.target === "self" ? "up" : "down";
    case "reckless":
      return "up";
    case "defense":
    case "guard":
    case "shield":
    case "finalBlowGuard":
      return "guard";
    case "heal":
      return "heal";
    case "draws":
      return "draw";
    default:
      return undefined;
  }
}

const dia = (i: number) => `M50 ${i} L${100 - i} 50 L50 ${100 - i} L${i} 50 Z`;

function Badge({ glyph, letter, uid }: { glyph: GlyphKey | undefined; letter: string; uid: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}y`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff36a" />
          <stop offset=".5" stopColor="#f2d000" />
          <stop offset="1" stopColor="#c79a00" />
        </linearGradient>
        <linearGradient id={`${uid}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".55" stopColor="#e8e8ee" />
          <stop offset="1" stopColor="#a9a9b4" />
        </linearGradient>
      </defs>
      <path d={dia(3)} transform="translate(0 2.5)" fill="#000" fillOpacity=".5" />
      <path d={dia(3)} fill="#0c0c0c" />
      <path d={dia(5)} fill={`url(#${uid}y)`} />
      <path d={dia(11.5)} fill="#0c0c0c" />
      <path d={dia(14)} fill={`url(#${uid}y)`} />
      <path d={dia(16.5)} fill="#0c0c0c" />
      {glyph ? (
        <g transform="translate(50 50) scale(.84) translate(-50 -50)" fill={`url(#${uid}w)`}>
          {GLYPH[glyph]}
        </g>
      ) : (
        <text x="50" y="66" textAnchor="middle" fontSize="46" fontWeight="900" fill={`url(#${uid}w)`}>
          {letter}
        </text>
      )}
    </svg>
  );
}

function ChromeText({ x, y, size, w, uid, children }: { x: number; y: number; size: number; w: number; uid: string; children: string }) {
  const layers = [
    { fill: "#000", fillOpacity: 0.5, stroke: "#000", strokeOpacity: 0.5, strokeWidth: w, transform: `translate(1 ${size * 0.05})` },
    { fill: "#16161a", stroke: "#16161a", strokeWidth: w },
    { fill: `url(#${uid}g)` },
  ];
  return (
    <>
      {layers.map((a, i) => (
        <text key={i} x={x} y={y} textAnchor="end" fontSize={size} strokeLinejoin="round" {...a}>
          {children}
        </text>
      ))}
    </>
  );
}

function CardNumber({ n, label, uid }: { n: number; label: string; uid: string }) {
  const text = String(n);
  // Fixed glyph size for every value; right-aligned at x=94 (textAnchor end), long numbers grow
  // leftwards through the svg's overflow:visible (4 digits ~ 132 units, still inside the card).
  const size = 53;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ fontFamily: "Archivo, 'Arial Black', sans-serif", fontWeight: 900, fontStyle: "italic" }}
    >
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".42" stopColor="#e4e6ec" />
          <stop offset=".5" stopColor="#8d909c" />
          <stop offset=".58" stopColor="#eef0f4" />
          <stop offset="1" stopColor="#b8bbc6" />
        </linearGradient>
        <filter id={`${uid}f`} x="-20%" y="-300%" width="140%" height="700%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <ChromeText x={94} y={70} size={size} w={8} uid={uid}>
        {text}
      </ChromeText>
      <g className="bcard-label">
        <path d="M-40 76.5 Q30 74.5 102 75.5 Q30 77.5 -40 76.5 Z" fill="#fff" filter={`url(#${uid}f)`} />
        <path d="M-30 76.3 Q35 75.2 100 75.6 Q35 76.8 -30 76.3 Z" fill="#fff" />
        <ChromeText x={98} y={97} size={21} w={5} uid={uid}>
          {label}
        </ChromeText>
      </g>
    </svg>
  );
}

function Star({ x, s, g }: { x: number; s: number; g: string }) {
  const pts =
    "M" +
    [...Array(10)]
      .map((_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.45 : s;
        return `${x + r * Math.cos(a)} ${s + 2 + r * Math.sin(a)}`;
      })
      .join("L") +
    "Z";
  return (
    <>
      <path d={pts} fill="#fff" stroke="#fff" strokeWidth={s * 0.5} strokeLinejoin="round" filter={`url(#${g}f)`} opacity=".7" />
      <path d={pts} fill="#fff" stroke="#fff" strokeWidth={s * 0.36} strokeLinejoin="round" />
      <path d={pts} fill={`url(#${g})`} stroke="#b27400" strokeWidth={s * 0.07} strokeLinejoin="round" />
    </>
  );
}

function Stars({ n, uid }: { n: number; uid: string }) {
  return (
    <svg viewBox={`0 0 ${n * 22 + 4} 26`} aria-hidden="true">
      <defs>
        <radialGradient id={uid} cx=".5" cy=".45" r=".55">
          <stop offset="0" stopColor="#fffbd0" />
          <stop offset=".45" stopColor="#ffd23a" />
          <stop offset="1" stopColor="#e08a00" />
        </radialGradient>
        <filter id={`${uid}f`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {[...Array(n)].map((_, i) => (
        <Star key={i} x={13 + i * 22} s={10} g={uid} />
      ))}
    </svg>
  );
}

/** Stable per-card number so a grid of cards doesn't shine in sync. */
const hashId = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * The OG's square battle card, laid out like docs/art-samples/og-sample.html: art under a
 * frame image (which carries the gem), skill badge, chrome number + label, rarity stars.
 * Art is public/cards/<id>.webp and may be missing; then the name shows in the art slot.
 * If the frame image is missing too, a coloured border and gem stand in.
 */
export function BattleCard({ card, owned, show, className, onClick }: Props) {
  const press = useCardInfoPress(card, owned);
  const uid = useId();
  const [artFailed, setArtFailed] = useState<string>();
  const [frameFailed, setFrameFailed] = useState<string>();
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  const value = show === "draw" ? card.draw : card.attack;
  const frameKey = `${card.type}-${card.rarity}`;
  return (
    <button
      type="button"
      className={`bcard card-${card.type}${className ? ` ${className}` : ""}`}
      data-rarity={card.rarity}
      style={{ "--shine-delay": `${-(hashId(card.id) % 900) / 100}s` } as CSSProperties}
      aria-label={`${card.name} ${show === "draw" ? "DRAW" : "POW"} ${value}`}
      onClick={onClick}
      {...press}
    >
      <span className="bcard-art">
        {artFailed === card.id ? (
          card.name
        ) : (
          <img
            src={`/cards/${card.id}.webp`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(card.id)}
          />
        )}
      </span>
      {frameFailed === frameKey ? (
        <>
          <span className="bcard-frame" />
          <span className="bcard-gem" />
        </>
      ) : (
        <img
          className="bcard-frame-img"
          src={`/frames/${frameKey}.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFrameFailed(frameKey)}
        />
      )}
      <span className="bcard-shine" aria-hidden="true" />
      {skill && (
        <span className="bcard-skill">
          <Badge glyph={glyphOf(skill)} letter={skill.name.slice(0, 1)} uid={`${uid}b`} />
        </span>
      )}
      <span className="bcard-num">
        <CardNumber n={value} label={show === "draw" ? "DRAW" : "POW"} uid={`${uid}n`} />
      </span>
      <span className="bcard-stars">
        <Stars n={RARITIES.indexOf(card.rarity) + 1} uid={`${uid}s`} />
      </span>
    </button>
  );
}
