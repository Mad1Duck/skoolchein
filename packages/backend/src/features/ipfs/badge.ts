import { fileURLToPath } from "node:url";
import { createAvatar } from "@dicebear/core";
import { bottts, notionists } from "@dicebear/collection";
import { Resvg } from "@resvg/resvg-js";

/**
 * Draws the picture of a credential NFT: an SVG card (character + program + wallet) rendered to PNG,
 * which wallets show more reliably than SVG. Everything is local: no external image service.
 */

export type BadgeKind = "student" | "donor";

export interface BadgeInput {
  kind: BadgeKind;
  wallet: string;
  pid: number;
  programName: string;
  date: Date;
}

// The fonts ship with the app (npm packages), so a server without system fonts still draws the text.
const font = (pkgPath: string) => fileURLToPath(import.meta.resolve(pkgPath));
const FONT_FILES = [
  "@expo-google-fonts/paytone-one/400Regular/PaytoneOne_400Regular.ttf",
  "@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf",
  "@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf",
];

export const BADGE_THEME = {
  student: { title: "Scholarship Graduate", tag: "SCHOLAR", bg: "#7FDBDA", panel: "c0aede", style: notionists },
  donor: { title: "Scholarship Donor", tag: "DONOR", bg: "#FCD444", panel: "b6e3f4", style: bottts },
} as const;

const SIZE = 1000;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Long program names are cut so they stay inside the card. */
function fit(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function badgeSvg({ kind, wallet, pid, programName, date }: BadgeInput): string {
  const theme = BADGE_THEME[kind];
  // The same wallet always gets the same character for a kind of badge.
  const avatar = createAvatar(theme.style as typeof notionists, {
    seed: `${wallet.toLowerCase()}-${kind}`,
    backgroundColor: [theme.panel],
  })
    .toString()
    .replace("<svg ", '<svg x="270" y="110" width="460" height="460" ');
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  const day = date.toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${theme.bg}"/>
  <rect x="282" y="122" width="460" height="460" fill="#000"/>
  ${avatar}
  <rect x="270" y="110" width="460" height="460" fill="none" stroke="#000" stroke-width="8"/>
  <rect x="40" y="40" width="190" height="64" rx="12" fill="#000"/>
  <text x="135" y="84" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="32" fill="#fff">#${pid}</text>
  <rect x="752" y="40" width="208" height="64" rx="32" fill="#fff" stroke="#000" stroke-width="6"/>
  <text x="856" y="83" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="28" fill="#000">${theme.tag}</text>
  <rect x="52" y="642" width="920" height="320" rx="36" fill="#000"/>
  <rect x="40" y="630" width="920" height="320" rx="36" fill="#fff" stroke="#000" stroke-width="8"/>
  <text x="500" y="724" text-anchor="middle" font-family="Paytone One" font-size="56" fill="#000">${theme.title}</text>
  <text x="500" y="802" text-anchor="middle" font-family="Nunito" font-weight="700" font-size="38" fill="#000">${escapeXml(fit(programName, 40))}</text>
  <line x1="120" y1="842" x2="880" y2="842" stroke="#000" stroke-width="4"/>
  <text x="120" y="906" font-family="Nunito" font-weight="700" font-size="34" fill="#444">${short}</text>
  <text x="880" y="906" text-anchor="end" font-family="Nunito" font-weight="700" font-size="34" fill="#444">${day}</text>
</svg>`;
}

export function renderBadgePng(input: BadgeInput): Uint8Array<ArrayBuffer> {
  const png = new Resvg(badgeSvg(input), {
    fitTo: { mode: "width", value: SIZE },
    font: { fontFiles: FONT_FILES.map(font), loadSystemFonts: false, defaultFontFamily: "Nunito" },
  })
    .render()
    .asPng();
  return new Uint8Array(png);
}
