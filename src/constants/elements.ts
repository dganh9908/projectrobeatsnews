import { ElementConfig } from '../types';

export const ELEMENT_BASE_COLORS: Record<string, { color: string; hex: string; bg: string; border: string; text: string }> = {
  Rush: { color: 'Red', hex: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400' },
  Flow: { color: 'Purple', hex: '#A855F7', bg: 'bg-purple-500/15', border: 'border-purple-500/30', text: 'text-purple-400' },
  Beat: { color: 'Orange', hex: '#F97316', bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400' },
  Vibe: { color: 'Green', hex: '#22C55E', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  Chill: { color: 'Blue', hex: '#3B82F6', bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400' },
};

const PRIMARY_ELEMENTS = ['Rush', 'Flow', 'Beat', 'Vibe', 'Chill'] as const;

// Generate inline SVG element badge
export function createDefaultElementSvg(name: string, primaryHex: string, secondaryHex?: string): string {
  const isCombo = Boolean(secondaryHex && secondaryHex !== primaryHex);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <defs>
      <linearGradient id="grad_${name.replace(/[^a-zA-Z0-9]/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryHex}" />
        <stop offset="100%" stop-color="${isCombo ? secondaryHex : primaryHex}" />
      </linearGradient>
    </defs>
    <rect width="48" height="48" rx="12" fill="#0C1017" stroke="${primaryHex}" stroke-opacity="0.4" stroke-width="2"/>
    <polygon points="24,7 39,24 24,41 9,24" fill="url(#grad_${name.replace(/[^a-zA-Z0-9]/g, '_')})" opacity="0.9"/>
    <circle cx="24" cy="24" r="5" fill="#FFFFFF" opacity="0.95"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ALL_ELEMENT_NAMES: string[] = [
  // Primary (5)
  'Rush',
  'Flow',
  'Beat',
  'Vibe',
  'Chill',
  // Rush combos (4)
  'Rush/Flow',
  'Rush/Vibe',
  'Rush/Chill',
  'Rush/Beat',
  // Flow combos (4)
  'Flow/Rush',
  'Flow/Vibe',
  'Flow/Chill',
  'Flow/Beat',
  // Vibe combos (4)
  'Vibe/Rush',
  'Vibe/Flow',
  'Vibe/Chill',
  'Vibe/Beat',
  // Chill combos (4)
  'Chill/Flow',
  'Chill/Vibe',
  'Chill/Beat',
  'Chill/Rush',
  // Beat combos (4)
  'Beat/Vibe',
  'Beat/Rush',
  'Beat/Chill',
  'Beat/Flow',
];

export function buildDefaultElements(): ElementConfig[] {
  return ALL_ELEMENT_NAMES.map(name => {
    const parts = name.split('/');
    const primary = parts[0];
    const secondary = parts[1];

    const primInfo = ELEMENT_BASE_COLORS[primary] || ELEMENT_BASE_COLORS.Flow;
    const secInfo = secondary ? ELEMENT_BASE_COLORS[secondary] : undefined;

    const colorDesc = secondary 
      ? `${primInfo.color} / ${secInfo?.color || ''}` 
      : primInfo.color;

    return {
      name,
      color: colorDesc,
      hexColor: primInfo.hex,
      secondaryHexColor: secInfo?.hex,
      imageUrl: createDefaultElementSvg(name, primInfo.hex, secInfo?.hex),
    };
  });
}

function normalizePrimaryToken(token: string): string {
  const clean = token.trim();
  const matched = PRIMARY_ELEMENTS.find(p => p.toLowerCase() === clean.toLowerCase());
  return matched || clean;
}

export function normalizeElementName(elementName?: string): string {
  if (!elementName) return '';
  const trimmed = String(elementName).trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === 'standard' || lower === 'none' || lower === 'null' || lower === 'undefined' || lower === '-') {
    return '';
  }

  if (trimmed.includes('/')) {
    const parts = trimmed
      .split('/')
      .map(normalizePrimaryToken)
      .filter(Boolean);
    return parts.join('/');
  }
  
  // Check if it's two primary element names concatenated without slash, e.g. BeatChill -> Beat/Chill, RushFlow -> Rush/Flow
  for (const p1 of PRIMARY_ELEMENTS) {
    for (const p2 of PRIMARY_ELEMENTS) {
      if (p1 !== p2 && lower === `${p1}${p2}`.toLowerCase()) {
        return `${p1}/${p2}`;
      }
    }
  }
  return normalizePrimaryToken(trimmed);
}

export function getElementStyles(elementName: string) {
  const normName = normalizeElementName(elementName);
  const parts = (normName || 'Flow').split('/');
  const primary = parts[0].trim();
  const secondary = parts[1]?.trim();

  const primInfo = ELEMENT_BASE_COLORS[primary] || ELEMENT_BASE_COLORS.Flow;
  const secInfo = secondary ? ELEMENT_BASE_COLORS[secondary] : undefined;

  return {
    primary,
    secondary,
    color: primInfo.color,
    hexColor: primInfo.hex,
    secondaryHexColor: secInfo?.hex,
    bg: primInfo.bg,
    border: primInfo.border,
    text: primInfo.text,
  };
}

export function getElementData(elementName: string, customElements?: ElementConfig[]) {
  const cleanName = normalizeElementName(elementName);
  if (!cleanName) return null;

  const custom = customElements?.find(e => 
    e.name.toLowerCase() === cleanName.toLowerCase() ||
    e.name.replace(/[^a-zA-Z]/g, '').toLowerCase() === cleanName.replace(/[^a-zA-Z]/g, '').toLowerCase()
  );
  
  const styles = getElementStyles(cleanName);
  const resolvedImageUrl = (custom?.imageUrl && custom.imageUrl.trim()) 
    ? custom.imageUrl.trim() 
    : createDefaultElementSvg(cleanName, styles.hexColor, styles.secondaryHexColor);
  
  return {
    name: cleanName,
    color: custom?.color || (styles.secondary ? `${styles.color} / ${styles.secondary}` : styles.color),
    hexColor: custom?.hexColor || styles.hexColor,
    secondaryHexColor: custom?.secondaryHexColor || styles.secondaryHexColor,
    imageUrl: resolvedImageUrl,
    bg: styles.bg,
    border: styles.border,
    text: styles.text,
  };
}
