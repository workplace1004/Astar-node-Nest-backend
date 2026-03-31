import { BadRequestException, Injectable } from '@nestjs/common';
import { AstrologyClient, AstrologyError } from '@astro-api/astroapi-typescript';
import { PrismaService } from '../prisma/prisma.service';

const SIGNS_ES = [
  'Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo',
  'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis',
];

const SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

// Day-of-year boundaries for tropical sun signs (Aries=0 .. Capricorn=11). Start of each sign.
const SUN_DOY_BOUNDS = [80, 110, 141, 172, 204, 235, 266, 296, 326, 356, 385, 415, 445];

function getDayOfYear(month: number, day: number): number {
  const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return days[month - 1] + day;
}

// Short descriptions per sign for Sol, Luna and Ascendente (in Spanish).
const SOL_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Tu Sol en Aries marca una identidad de acción, valentía y liderazgo. Te impulsa a tomar la iniciativa y a defender lo que crees.',
  Tauro: 'Tu Sol en Tauro te conecta con la estabilidad, el placer sensorial y lo tangible. Buscas seguridad y belleza en lo que construyes.',
  Géminis: 'Tu Sol en Géminis destaca la comunicación, la curiosidad y la versatilidad. Tu mente ágil te lleva a conectar ideas y personas.',
  Cáncer: 'Tu Sol en Cáncer habla de sensibilidad, cuidado y raíces. Tu mundo emocional y tu hogar son centrales en tu manera de ser.',
  Leo: 'Tu Sol en Leo brilla en la creatividad, el reconocimiento y la generosidad. Te gusta aportar luz y calor a tu entorno.',
  Virgo: 'Tu Sol en Virgo se expresa en el servicio, el detalle y la mejora constante. Buscas ser útil y perfeccionar lo que tocas.',
  Libra: 'Tu Sol en Libra busca equilibrio, armonía y relaciones. La justicia y la belleza guían tu manera de relacionarte.',
  Escorpio: 'Tu Sol en Escorpio profundiza en lo intenso, lo transformador y lo oculto. Tienes capacidad de renovarte y de ver más allá.',
  Sagitario: 'Tu Sol en Sagitario expande con filosofía, viaje y búsqueda de sentido. Tu optimismo y tu sed de verdad te definen.',
  Capricornio: 'Tu Sol en Capricornio construye con responsabilidad, ambición y estructura. El tiempo y el esfuerzo son tus aliados.',
  Acuario: 'Tu Sol en Acuario innova con ideas, comunidad y visión de futuro. Tu identidad se vincula a lo colectivo y lo distinto.',
  Piscis: 'Tu Sol en Piscis fluye con la intuición, la compasión y lo artístico. Conectas con lo que está más allá de lo visible.',
};

const LUNA_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Tu Luna en Aries necesita acción y autonomía. Las emociones se viven con intensidad y rapidez; te cuesta esperar.',
  Tauro: 'Tu Luna en Tauro busca calma y placer. Te nutres con rutinas, naturaleza y vínculos estables.',
  Géminis: 'Tu Luna en Géminis procesa las emociones hablando y conectando. La variedad y la información te calman.',
  Cáncer: 'Tu Luna en Cáncer está en su domicilio: las emociones y el hogar son el centro de tu mundo interior.',
  Leo: 'Tu Luna en Leo necesita ser vista y valorada. El afecto se expresa con calidez y creatividad.',
  Virgo: 'Tu Luna en Virgo se calma con orden y utilidad. Cuidas a los demás desde el detalle y el servicio.',
  Libra: 'Tu Luna en Libra busca armonía en las relaciones. El conflicto te desestabiliza; necesitas equilibrio y belleza.',
  Escorpio: 'Tu Luna en Escorpio siente todo con profundidad. Las emociones son intensas y a veces secretas.',
  Sagitario: 'Tu Luna en Sagitario busca sentido y libertad. El humor y la fe te ayudan a procesar lo que sientes.',
  Capricornio: 'Tu Luna en Capricornio se protege con estructura. Puedes parecer frío, pero tu compromiso es profundo.',
  Acuario: 'Tu Luna en Acuario necesita espacio y conexión con lo colectivo. Las emociones se viven con distancia y originalidad.',
  Piscis: 'Tu Luna en Piscis se funde con el otro y con lo invisible. La intuición y el arte te nutren.',
};

const ASCENDENTE_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Con Ascendente en Aries proyectas energía, iniciativa y franqueza. Das la impresión de alguien seguro y decidido.',
  Tauro: 'Con Ascendente en Tauro transmites calma y presencia. Te perciben como alguien confiable y con los pies en la tierra.',
  Géminis: 'Con Ascendente en Géminis pareces ágil, curioso y comunicativo. La primera impresión es de ligereza y versatilidad.',
  Cáncer: 'Con Ascendente en Cáncer das una imagen sensible y protectora. Transmites cercanía y cuidado desde el primer contacto.',
  Leo: 'Con Ascendente en Leo tu presencia llama la atención. Proyectas confianza, calidez y un toque dramático.',
  Virgo: 'Con Ascendente en Virgo te ven ordenado y útil. La primera impresión es de discreción y competencia.',
  Libra: 'Con Ascendente en Libra causas buena impresión: amabilidad, equilibrio y gusto por la armonía se notan al instante.',
  Escorpio: 'Con Ascendente en Escorpio proyectas intensidad y misterio. Tu mirada y tu presencia dejan huella.',
  Sagitario: 'Con Ascendente en Sagitario transmites optimismo y apertura. Pareces alguien que busca aprender y explorar.',
  Capricornio: 'Con Ascendente en Capricornio das una imagen seria y responsable. Te perciben como alguien en quien confiar.',
  Acuario: 'Con Ascendente en Acuario pareces original y desapegado. La primera impresión es de libertad e ideas propias.',
  Piscis: 'Con Ascendente en Piscis proyectas suavidad e intuición. Transmites empatía y un aura algo evasiva.',
};

const CONTENT_STYLE_CATEGORY_TITLE = '__content_style_config__';

export interface BirthChartPreviewDto {
  birthDate: string;  // YYYY-MM-DD
  birthTime: string;  // HH:mm
  birthPlace: string;
  email: string;
  lat: number;
  lon: number;
  tzone?: number;
  timezone?: string;
}

export interface SignResult {
  sign: string;
  symbol: string;
  description: string;
}

export interface BirthChartPreviewResult {
  sun: SignResult;
  moon: SignResult;
  ascendant: SignResult;
  chartUrl: string;
  debug?: {
    provider: {
      sun: { sign: string; degree: number | null };
      moon: { sign: string; degree: number | null };
      ascendant: { sign: string; degree: number | null };
    };
  };
}

function computeTimezoneOffsetHours(dateIso: string, time24: string, timezone: string): number | null {
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

function normalizeChartString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed) || isDataImageUri(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (looksLikeSvgMarkup(trimmed)) return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
  if (looksLikeSvgBase64(trimmed)) return `data:image/svg+xml;base64,${trimmed}`;
  return null;
}

function tryExtractChartFromRawText(rawText: string): string | null {
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

function describePayloadShape(payload: unknown, rawText: string): string {
  if (typeof payload === 'string') {
    const snippet = payload.trim().slice(0, 120).replace(/\s+/g, ' ');
    return `string:${snippet || '[vacio]'}`;
  }
  if (Array.isArray(payload)) return `array(len=${payload.length})`;
  if (payload && typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>).slice(0, 10);
    return `object(keys=${keys.join(',') || 'sin-claves'})`;
  }
  if (rawText.trim().length > 0) {
    const snippet = rawText.trim().slice(0, 120).replace(/\s+/g, ' ');
    return `raw:${snippet}`;
  }
  return String(payload);
}

function extractProviderErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const direct =
    (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) ||
    (typeof obj.message === 'string' && obj.message.trim()) ||
    (typeof obj.msg === 'string' && obj.msg.trim()) ||
    (typeof obj.error === 'string' && obj.error.trim());
  if (direct) return direct;
  const nested = obj.error ?? obj.response ?? obj.data ?? obj.result;
  if (nested && typeof nested === 'object') return extractProviderErrorMessage(nested);
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
  return (
    toSpanishSign(obj.sign) ??
    toSpanishSign(obj.sign_name) ??
    toSpanishSign(obj.zodiac_sign) ??
    toSpanishSign(obj.rashi)
  );
}

function parseDegreeFromNode(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.degree, obj.normDegree, obj.fullDegree, obj.norm_degree, obj.full_degree];
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
function ianaTimezoneForBirth(iana: string | undefined, offsetHours: number): string | undefined {
  const trimmed = iana?.trim();
  if (trimmed) return trimmed;
  if (!Number.isFinite(offsetHours)) return undefined;
  const rounded = Math.round(offsetHours * 2) / 2;
  if (rounded % 1 !== 0) return undefined;
  const n = Math.trunc(Math.abs(rounded));
  if (n === 0) return 'Etc/UTC';
  return rounded > 0 ? `Etc/GMT-${n}` : `Etc/GMT+${n}`;
}

function findPlanetDataInPayload(input: unknown, planetAliases: string[]): { sign: string; degree: number | null } | null {
  const aliases = new Set(planetAliases.map((a) => normalizeKey(a)));
  const visited = new Set<unknown>();

  const tryObject = (obj: Record<string, unknown>): { sign: string; degree: number | null } | null => {
    const nameCandidates = [obj.name, obj.planet, obj.object, obj.id]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => normalizeKey(v));
    if (nameCandidates.some((n) => aliases.has(n))) {
      const sign = parseSignFromNode(obj);
      if (!sign) return null;
      return { sign, degree: parseDegreeFromNode(obj) };
    }

    // Fallback for keyed maps like { sun: { sign: "Sagittarius" } }
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

    // Only traverse known containers to avoid matching unrelated nested sign fields.
    const containers = [obj.data, obj.result, obj.response, obj.planets, obj.items];
    for (const container of containers) {
      const found = scan(container);
      if (found) return found;
    }
    return null;
  };

  return scan(input);
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
  // Fallback: scan unknown object shape to tolerate provider format changes.
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

@Injectable()
export class BirthChartService {
  constructor(private readonly prisma: PrismaService) {}

  async getContentStyleConfig(): Promise<unknown | null> {
    try {
      const category = await this.prisma.knowledgeCategory.findFirst({
        where: { title: CONTENT_STYLE_CATEGORY_TITLE },
        include: {
          entries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      const raw = category?.entries?.[0]?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async getInterpretationMaps(): Promise<{
    sun: Record<string, string>;
    moon: Record<string, string>;
    ascendant: Record<string, string>;
  }> {
    const fallback = {
      sun: SOL_DESCRIPTIONS,
      moon: LUNA_DESCRIPTIONS,
      ascendant: ASCENDENTE_DESCRIPTIONS,
    };
    try {
      const rows = await this.prisma.birthChartInterpretation.findMany();
      if (!rows.length) return fallback;
      const fromDb = {
        sun: { ...SOL_DESCRIPTIONS },
        moon: { ...LUNA_DESCRIPTIONS },
        ascendant: { ...ASCENDENTE_DESCRIPTIONS },
      };
      for (const row of rows) {
        if (row.type === 'sun') {
          fromDb.sun[row.sign] = row.description;
          continue;
        }
        if (row.type === 'moon') {
          fromDb.moon[row.sign] = row.description;
          continue;
        }
        if (row.type === 'ascendant') {
          fromDb.ascendant[row.sign] = row.description;
        }
      }
      return fromDb;
    } catch {
      // Keep endpoint working while migration/seed is still pending in a given environment.
      return fallback;
    }
  }

  getSunSign(_year: number, month: number, day: number): number {
    let doy = getDayOfYear(month, day);
    if (month <= 2) doy += 365;
    for (let i = 0; i < 12; i++) {
      if (doy >= SUN_DOY_BOUNDS[i] && doy < SUN_DOY_BOUNDS[i + 1]) return i;
    }
    return 0;
  }

  async getPreview(dto: BirthChartPreviewDto): Promise<BirthChartPreviewResult> {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email inválido.');
    }

    const astrologyApiKey = process.env.ASTROLOGY_API_KEY?.trim();
    if (!astrologyApiKey) {
      throw new BadRequestException('La API astrológica no está configurada en backend (ASTROLOGY_API_KEY).');
    }
    if (typeof dto.lat !== 'number' || !Number.isFinite(dto.lat) || typeof dto.lon !== 'number' || !Number.isFinite(dto.lon)) {
      throw new BadRequestException('Latitud y longitud son obligatorias para generar la carta astral.');
    }

    const timezoneFromInput = dto.timezone?.trim();
    const resolvedTzone =
      typeof dto.tzone === 'number' && Number.isFinite(dto.tzone)
        ? dto.tzone
        : timezoneFromInput
          ? computeTimezoneOffsetHours(dto.birthDate, dto.birthTime, timezoneFromInput)
          : null;
    if (resolvedTzone == null) {
      throw new BadRequestException('No se pudo resolver la zona horaria para la carta astral.');
    }

    const [year, month, day] = dto.birthDate.split('-').map(Number);
    const [hour, minute] = dto.birthTime.split(':').map(Number);
    const birthHour = Number.isFinite(hour) ? hour : 12;
    const birthMinute = Number.isFinite(minute) ? minute : 0;
    const tzIana = ianaTimezoneForBirth(timezoneFromInput, resolvedTzone);
    const place = dto.birthPlace?.trim();

    const client = new AstrologyClient({ apiKey: astrologyApiKey });
    const subject = {
      name: email.split('@')[0] || 'Usuario',
      birth_data: {
        year,
        month,
        day,
        hour: birthHour,
        minute: birthMinute,
        second: 0,
        latitude: dto.lat,
        longitude: dto.lon,
        ...(place ? { city: place } : {}),
        ...(tzIana ? { timezone: tzIana } : {}),
      },
    };

    let svgMarkup: string;
    let positionsPayload: { planets: unknown[] };
    try {
      const [svg, positionsRes] = await Promise.all([
        client.svg.getNatalChartSvg({ subject }),
        client.data.getPositions({ subject }),
      ]);
      svgMarkup = svg;
      positionsPayload = { planets: positionsRes.positions ?? [] };
    } catch (err) {
      const astroErr = AstrologyError.normalize(err);
      throw new BadRequestException(astroErr.message || 'Error del proveedor astrológico (Astrology API).');
    }

    const chartUrl =
      normalizeChartString(svgMarkup) ?? tryExtractChartFromRawText(svgMarkup);
    if (typeof chartUrl !== 'string' || chartUrl.trim().length === 0) {
      throw new BadRequestException(
        `La API no devolvió el dibujo de la carta astral (SVG). Formato recibido: ${describePayloadShape(svgMarkup, typeof svgMarkup === 'string' ? svgMarkup : '')}`,
      );
    }

    const sunData = findPlanetDataInPayload(positionsPayload, ['sun', 'sol']);
    const moonData = findPlanetDataInPayload(positionsPayload, ['moon', 'luna']);
    const ascData = findPlanetDataInPayload(positionsPayload, ['ascendant', 'asc', 'lagna']);
    if (!sunData || !moonData || !ascData) {
      throw new BadRequestException(
        `No se pudieron resolver Sol/Luna/Ascendente desde posiciones planetarias. Formato recibido: ${describePayloadShape(positionsPayload, JSON.stringify(positionsPayload).slice(0, 200))}`,
      );
    }
    const sunSign = sunData.sign;
    const moonSign = moonData.sign;
    const ascSign = ascData.sign;
    const sunIndex = SIGNS_ES.indexOf(sunSign);
    const moonIndex = SIGNS_ES.indexOf(moonSign);
    const ascIndex = SIGNS_ES.indexOf(ascSign);
    if (sunIndex < 0 || moonIndex < 0 || ascIndex < 0) {
      throw new BadRequestException('El proveedor devolvió signos no reconocidos para Sol/Luna/Ascendente.');
    }
    const interpretationMaps = await this.getInterpretationMaps();

    const result: BirthChartPreviewResult = {
      sun: {
        sign: sunSign,
        symbol: SYMBOLS[sunIndex],
        description: interpretationMaps.sun[sunSign] ?? '',
      },
      moon: {
        sign: moonSign,
        symbol: SYMBOLS[moonIndex],
        description: interpretationMaps.moon[moonSign] ?? '',
      },
      ascendant: {
        sign: ascSign,
        symbol: SYMBOLS[ascIndex],
        description: interpretationMaps.ascendant[ascSign] ?? '',
      },
      chartUrl,
      ...(process.env.NODE_ENV !== 'production'
        ? {
            debug: {
              provider: {
                sun: { sign: sunData.sign, degree: sunData.degree },
                moon: { sign: moonData.sign, degree: moonData.degree },
                ascendant: { sign: ascData.sign, degree: ascData.degree },
              },
            },
          }
        : {}),
    };

    await this.prisma.preview.create({
      data: {
        email,
        birthDate: dto.birthDate,
        birthTime: dto.birthTime,
        birthPlace: dto.birthPlace?.trim() ?? '',
        sunSign,
        moonSign,
        ascendantSign: ascSign,
        chartUrl,
      },
    });

    return result;
  }
}
