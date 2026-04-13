/** Shared helpers for Astrology API chart/position responses (used by birth-chart + subscription reports). */

export function computeTimezoneOffsetHours(dateIso: string, time24: string, timezone: string): number | null {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const offsetToken = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const match = offsetToken.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2] ?? '0', 10);
  const minutes = parseInt(match[3] ?? '0', 10);
  return sign * (hours + minutes / 60);
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function isDataImageUri(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\//i.test(value.trim());
}

function looksLikeSvgMarkup(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.includes('<svg');
}

function looksLikeSvgBase64(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.startsWith('PHN2Zy') || normalized.startsWith('PD94bWwg');
}

export function normalizeChartString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed) || isDataImageUri(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (looksLikeSvgMarkup(trimmed)) return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
  if (looksLikeSvgBase64(trimmed)) return `data:image/svg+xml;base64,${trimmed}`;
  return null;
}

function findChartUrlInObject(input: unknown): string | null {
  if (!input) return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findChartUrlInObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const directKeys = ['chart_url', 'chartUrl', 'url', 'image_url', 'imageUrl', 'chart', 'chart_image', 'chartImage'];
  for (const key of directKeys) {
    const value = obj[key];
    const normalized = normalizeChartString(value);
    if (normalized) return normalized;
  }
  const nestedKeys = ['data', 'result', 'response'];
  for (const key of nestedKeys) {
    const nestedValue = obj[key];
    if (nestedValue && typeof nestedValue === 'object') {
      const nestedUrl = findChartUrlInObject(nestedValue);
      if (nestedUrl) return nestedUrl;
    }
  }
  for (const value of Object.values(obj)) {
    if (!value) continue;
    const normalized = normalizeChartString(value);
    if (normalized) return normalized;
    if (typeof value === 'object') {
      const nestedUrl = findChartUrlInObject(value);
      if (nestedUrl) return nestedUrl;
    }
  }
  return null;
}

function findSvgDataUriInObject(input: unknown): string | null {
  if (!input) return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findSvgDataUriInObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const svgKeys = ['svg', 'svg_data', 'svgData', 'image_svg', 'base64', 'chart_data', 'chartData'];
  for (const key of svgKeys) {
    const value = obj[key];
    const normalized = normalizeChartString(value);
    if (normalized) return normalized;
  }
  const nestedKeys = ['data', 'result', 'response'];
  for (const key of nestedKeys) {
    const nestedValue = obj[key];
    if (nestedValue && typeof nestedValue === 'object') {
      const nestedSvgUri = findSvgDataUriInObject(nestedValue);
      if (nestedSvgUri) return nestedSvgUri;
    }
  }
  for (const value of Object.values(obj)) {
    if (!value) continue;
    const normalized = normalizeChartString(value);
    if (normalized) return normalized;
    if (typeof value === 'object') {
      const nestedSvgUri = findSvgDataUriInObject(value);
      if (nestedSvgUri) return nestedSvgUri;
    }
  }
  return null;
}

export function tryExtractChartFromRawText(rawText: string): string | null {
  const normalizedDirect = normalizeChartString(rawText);
  if (normalizedDirect) return normalizedDirect;

  const trimmed = rawText.trim();
  const maybeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  if (maybeJson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const fromParsed =
        normalizeChartString(parsed) ?? findChartUrlInObject(parsed) ?? findSvgDataUriInObject(parsed);
      if (fromParsed) return fromParsed;
    } catch {
      // Keep fallback regex extraction below.
    }
  }

  const urlMatch = rawText.match(/https?:\/\/[^\s"']+/i);
  if (urlMatch && urlMatch[0]) return urlMatch[0].trim();
  return null;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toSpanishSign(signValue: unknown): string | null {
  if (typeof signValue !== 'string') return null;
  const key = normalizeKey(signValue);
  const map: Record<string, string> = {
    aries: 'Aries',
    ari: 'Aries',
    tauro: 'Tauro',
    taurus: 'Tauro',
    tau: 'Tauro',
    geminis: 'Géminis',
    gemini: 'Géminis',
    gem: 'Géminis',
    cancer: 'Cáncer',
    can: 'Cáncer',
    leo: 'Leo',
    virgo: 'Virgo',
    vir: 'Virgo',
    libra: 'Libra',
    lib: 'Libra',
    escorpio: 'Escorpio',
    scorpio: 'Escorpio',
    sco: 'Escorpio',
    sagitario: 'Sagitario',
    sagittarius: 'Sagitario',
    sag: 'Sagitario',
    capricornio: 'Capricornio',
    capricorn: 'Capricornio',
    cap: 'Capricornio',
    acuario: 'Acuario',
    aquarius: 'Acuario',
    aqu: 'Acuario',
    piscis: 'Piscis',
    pisces: 'Piscis',
    pis: 'Piscis',
  };
  return map[key] ?? null;
}

function parseSignFromNode(value: unknown): string | null {
  if (typeof value === 'string') return toSpanishSign(value);
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const signField = obj.sign;
  if (signField && typeof signField === 'object') {
    const inner = signField as Record<string, unknown>;
    const fromNested =
      toSpanishSign(inner.abbreviation) ??
      toSpanishSign(inner.abbr) ??
      toSpanishSign(inner.code) ??
      (typeof inner.name === 'string' ? toSpanishSign(inner.name) : null);
    if (fromNested) return fromNested;
  }
  return (
    (typeof signField === 'string' ? toSpanishSign(signField) : null) ??
    toSpanishSign(obj.sign_name) ??
    toSpanishSign(obj.zodiac_sign) ??
    toSpanishSign(obj.sign_abbreviation) ??
    toSpanishSign(obj.rashi)
  );
}

function parseDegreeFromNode(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const candidates = [
    obj.degree,
    obj.normDegree,
    obj.fullDegree,
    obj.norm_degree,
    obj.full_degree,
    obj.degree_in_sign,
  ];
  for (const item of candidates) {
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      const parsed = Number(item);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Astrology API v3 (astrology-api.io) uses IANA zones. When the client only sends a numeric
 * offset, approximate with Etc/GMT* for whole-hour offsets (Etc/GMT sign is inverted vs UTC offset).
 */
export function ianaTimezoneForBirth(iana: string | undefined, offsetHours: number): string | undefined {
  const trimmed = iana?.trim();
  if (trimmed) return trimmed;
  if (!Number.isFinite(offsetHours)) return undefined;
  const rounded = Math.round(offsetHours * 2) / 2;
  if (rounded % 1 !== 0) return undefined;
  const n = Math.trunc(Math.abs(rounded));
  if (n === 0) return 'Etc/UTC';
  return rounded > 0 ? `Etc/GMT-${n}` : `Etc/GMT+${n}`;
}

function looksLikePlanetaryRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.name === 'string' ||
    typeof r.point === 'string' ||
    typeof r.planet === 'string' ||
    typeof r.body === 'string' ||
    typeof r.id === 'string' ||
    typeof r.sign === 'string' ||
    (r.sign !== null && typeof r.sign === 'object')
  );
}

/** Astrology API v3 may use `positions`, `planetary_positions`, `planets`, or nest under `data`. */
export function extractPlanetaryPositionsList(raw: unknown, depth = 0): unknown[] {
  if (depth > 8) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    return looksLikePlanetaryRow(raw[0]) ? raw : [];
  }
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const childKeys = [
    'positions',
    'planets',
    'planetary_positions',
    'celestial_points',
    'planetary_positions_tropical',
    'data',
    'result',
    'response',
    'items',
  ];
  for (const k of childKeys) {
    const v = o[k];
    if (v === undefined || v === null) continue;
    const got = extractPlanetaryPositionsList(v, depth + 1);
    if (got.length > 0) return got;
  }
  return [];
}

export function findPlanetDataInPayload(
  input: unknown,
  planetAliases: string[],
): { sign: string; degree: number | null } | null {
  const aliases = new Set(planetAliases.map((a) => normalizeKey(a)));
  const visited = new Set<unknown>();

  const tryObject = (obj: Record<string, unknown>): { sign: string; degree: number | null } | null => {
    const nameCandidates = [obj.name, obj.planet, obj.object, obj.point, obj.body, obj.label, obj.point_name, obj.id]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => normalizeKey(v.replace(/_/g, '')));
    const nameCandidatesUnderscore = [obj.name, obj.planet, obj.point, obj.id]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => normalizeKey(v));
    const combined = new Set([...nameCandidates, ...nameCandidatesUnderscore]);
    if ([...combined].some((n) => aliases.has(n))) {
      const sign = parseSignFromNode(obj);
      if (!sign) return null;
      return { sign, degree: parseDegreeFromNode(obj) };
    }

    for (const alias of aliases) {
      if (alias in obj) {
        const node = obj[alias];
        const sign = parseSignFromNode(node);
        if (sign) return { sign, degree: parseDegreeFromNode(node) };
      }
    }
    return null;
  };

  const scan = (node: unknown): { sign: string; degree: number | null } | null => {
    if (!node || typeof node !== 'object') return null;
    if (visited.has(node)) return null;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = scan(item);
        if (found) return found;
      }
      return null;
    }

    const obj = node as Record<string, unknown>;
    const direct = tryObject(obj);
    if (direct) return direct;

    const containers = [obj.data, obj.result, obj.response, obj.planets, obj.positions, obj.planetary_positions, obj.items];
    for (const container of containers) {
      const found = scan(container);
      if (found) return found;
    }
    return null;
  };

  return scan(input);
}
