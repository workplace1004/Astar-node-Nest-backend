import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type Provider = 'mercadopago' | 'paypal';
type Billing = 'monthly' | 'annual';
type Plan = 'essentials' | 'portal' | 'depth';
type ExtraType = 'extra_question' | 'private_session';
type ReportType = 'birth_chart' | 'solar_return' | 'numerology';

/** PayPal Orders v2 response used after capture or GET when status is COMPLETED. */
type PayPalCompletedOrderShape = {
  id?: string;
  status?: string;
  message?: string;
  purchase_units?: Array<{
    custom_id?: string;
    reference_id?: string;
    payments?: { captures?: Array<{ amount?: { currency_code?: string; value?: string } }> };
    amount?: { currency_code?: string; value?: string };
  }>;
};

export interface CheckoutResult {
  provider: Provider;
  checkoutUrl: string;
  reference: string;
}

interface SubscriptionCheckoutInput {
  provider: Provider;
  plan: Plan;
  billing: Billing;
}

interface ExtraCheckoutInput {
  provider: 'mercadopago';
  extraType: ExtraType;
  quantity?: number;
}

const FRONTEND_BASE = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const SUBSCRIPTION_CATALOG: Record<Plan, { title: string; usd: Record<Billing, number>; ars: Record<Billing, number> }> = {
  essentials: {
    title: 'Astar Essentials',
    usd: { monthly: 19, annual: 15 },
    ars: { monthly: 19000, annual: 13000 },
  },
  portal: {
    title: 'Astar Portal completo',
    /** Alineado con landing: 29 USD/mes o pago anual (19 USD/mes × 12). */
    usd: { monthly: 29, annual: 228 },
    ars: { monthly: 42050, annual: 330600 },
  },
  depth: {
    title: 'Astar Depth',
    usd: { monthly: 79, annual: 59 },
    ars: { monthly: 79000, annual: 59000 },
  },
};

const EXTRAS_CATALOG: Record<ExtraType, { title: string; usd: number; ars: number }> = {
  extra_question: { title: 'Pregunta extra', usd: 12, ars: 12000 },
  private_session: { title: 'Sesión privada', usd: 45, ars: 43000 },
};

/** Portal extras catalog (USD); ARS for Mercado Pago ≈ usd * 1450. Keep aligned with frontend `extraServicesCatalog`. */
const PORTAL_EXTRA_SERVICES: Record<string, { title: string; usdGuest: number; usdSub: number }> = {
  'momento-actual': { title: 'Lectura de tu momento actual + preguntas', usdGuest: 210, usdSub: 105 },
  'energia-interna': { title: 'Tu energía interna vs la que estás mostrando', usdGuest: 110, usdSub: 55 },
  'tomar-decision': { title: 'Tomar una decisión', usdGuest: 110, usdSub: 55 },
  'movimientos-6m': { title: 'Tus próximos movimientos — 6 meses', usdGuest: 180, usdSub: 90 },
  'movimientos-12m': { title: 'Tus próximos movimientos — 12 meses', usdGuest: 230, usdSub: 115 },
  'audio-personalizado': { title: 'Audio personalizado de lo que necesites', usdGuest: 50, usdSub: 25 },
  'carta-vivo': { title: 'Lectura en vivo de tu carta astral', usdGuest: 540, usdSub: 270 },
  'solar-vivo': { title: 'Lectura en vivo de tu revolución solar', usdGuest: 540, usdSub: 270 },
  'tres-preguntas': { title: '3 preguntas (respondo integrando todas mis herramientas)', usdGuest: 70, usdSub: 35 },
};

function encodeExternalReference(input: Record<string, string>): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function decodeExternalReference(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return typeof parsed === 'object' && parsed != null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function normalizeBirthDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const trimmed = date.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseBirthDateParts(birthDate: string | null | undefined): { year: number; month: number; day: number } | null {
  const normalized = normalizeBirthDate(birthDate);
  if (!normalized) return null;
  const [yearRaw, monthRaw, dayRaw] = normalized.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function reduceNumber(value: number, preserveMaster = true): number {
  let current = Math.abs(Math.trunc(value));
  while (current > 9 && (!preserveMaster || ![11, 22, 33].includes(current))) {
    current = String(current)
      .split('')
      .map((d) => Number(d))
      .reduce((acc, curr) => acc + curr, 0);
  }
  return current;
}

function calculateLifePathNumber(birthDate: string | null | undefined): string | null {
  const normalized = normalizeBirthDate(birthDate);
  if (!normalized) return null;
  const digits = normalized.replace(/-/g, '').split('').map((d) => Number(d));
  if (digits.some((d) => Number.isNaN(d))) return null;
  return String(reduceNumber(digits.reduce((acc, curr) => acc + curr, 0), true));
}

function calculateBirthdayNumber(day: number): number {
  return reduceNumber(day, true);
}

function calculateAttitudeNumber(month: number, day: number): number {
  return reduceNumber(month + day, true);
}

function calculatePersonalYear(month: number, day: number, year: number): number {
  const universalYear = reduceNumber(year, false);
  return reduceNumber(month + day + universalYear, true);
}

function mapNameCharsToNumber(fullName: string): { expression: number | null; soulUrge: number | null; personality: number | null } {
  const map: Record<string, number> = {
    A: 1, J: 1, S: 1,
    B: 2, K: 2, T: 2,
    C: 3, L: 3, U: 3,
    D: 4, M: 4, V: 4,
    E: 5, N: 5, W: 5,
    F: 6, O: 6, X: 6,
    G: 7, P: 7, Y: 7,
    H: 8, Q: 8, Z: 8,
    I: 9, R: 9,
  };
  const normalized = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const vowels = new Set(['A', 'E', 'I', 'O', 'U']);
  let all = 0;
  let vowelSum = 0;
  let consonantSum = 0;

  for (const ch of normalized) {
    const val = map[ch];
    if (!val) continue;
    all += val;
    if (vowels.has(ch)) vowelSum += val;
    else consonantSum += val;
  }

  return {
    expression: all > 0 ? reduceNumber(all, true) : null,
    soulUrge: vowelSum > 0 ? reduceNumber(vowelSum, true) : null,
    personality: consonantSum > 0 ? reduceNumber(consonantSum, true) : null,
  };
}

function getSunSignFromBirthDate(birthDate: string | null | undefined): string | null {
  const parts = parseBirthDateParts(birthDate);
  if (!parts) return null;
  const md = parts.month * 100 + parts.day;
  if (md >= 321 && md <= 419) return 'Aries';
  if (md >= 420 && md <= 520) return 'Tauro';
  if (md >= 521 && md <= 620) return 'Géminis';
  if (md >= 621 && md <= 722) return 'Cáncer';
  if (md >= 723 && md <= 822) return 'Leo';
  if (md >= 823 && md <= 922) return 'Virgo';
  if (md >= 923 && md <= 1022) return 'Libra';
  if (md >= 1023 && md <= 1121) return 'Escorpio';
  if (md >= 1122 && md <= 1221) return 'Sagitario';
  if ((md >= 1222 && md <= 1231) || (md >= 101 && md <= 119)) return 'Capricornio';
  if (md >= 120 && md <= 218) return 'Acuario';
  if (md >= 219 && md <= 320) return 'Piscis';
  return null;
}

function numberMeaning(n: string | number): string {
  const key = String(n);
  const map: Record<string, string> = {
    '1': 'iniciativa, autonomía y liderazgo personal',
    '2': 'cooperación, diplomacia y sensibilidad vincular',
    '3': 'expresión creativa, comunicación y optimismo',
    '4': 'orden, constancia, método y construcción sólida',
    '5': 'cambio, libertad, adaptabilidad y movimiento',
    '6': 'responsabilidad, cuidado, armonía y servicio',
    '7': 'introspección, análisis, estudio y profundidad',
    '8': 'gestión, logro material, estrategia y autoridad',
    '9': 'compasión, cierre de ciclos y visión humanista',
    '11': 'intuición elevada, inspiración y visión sensible',
    '22': 'maestría práctica para construir impacto duradero',
    '33': 'servicio compasivo y vocación de guía',
  };
  return map[key] ?? 'potencial de aprendizaje y crecimiento';
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  private async requireClient(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.role !== 'client' && user.role !== 'admin') {
      throw new ForbiddenException('Payments are for client users only');
    }
    return user;
  }

  private getMercadoPagoToken(): string {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new BadRequestException('Missing MERCADOPAGO_ACCESS_TOKEN');
    return token;
  }

  private getPayPalApiBase(): string {
    return process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  private async getPayPalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) throw new BadRequestException('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
    const base = this.getPayPalApiBase();
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new BadRequestException(body.error_description ?? 'PayPal authentication failed');
    }
    return body.access_token;
  }

  private async clearExtrasCart(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { extrasCartServiceIds: [] },
    });
  }

  async createSubscriptionCheckout(userId: string, input: SubscriptionCheckoutInput): Promise<CheckoutResult> {
    const user = await this.requireClient(userId);

    const config = SUBSCRIPTION_CATALOG[input.plan];
    if (!config) throw new BadRequestException('Invalid plan');

    if (input.provider === 'paypal') {
      return this.createPayPalSubscriptionOrder(user, input.plan, input.billing);
    }

    if (input.provider !== 'mercadopago') throw new BadRequestException('Invalid provider');

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) throw new BadRequestException('Missing MERCADOPAGO_ACCESS_TOKEN');
    const accessToken = this.getMercadoPagoToken();
    const amount = config.ars[input.billing];
    const externalReference = encodeExternalReference({
      userId,
      paymentKind: 'subscription',
      plan: input.plan,
      billing: input.billing,
      provider: 'mercadopago',
    });

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: `${config.title} (${input.billing === 'monthly' ? 'Mensual' : 'Anual'})`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: amount,
          },
        ],
        external_reference: externalReference,
        metadata: {
          userId,
          paymentKind: 'subscription',
          plan: input.plan,
          billing: input.billing,
          provider: 'mercadopago',
        },
        auto_return: 'approved',
        back_urls: {
          success: `${FRONTEND_BASE}/portal/subscription?provider=mercadopago&status=success`,
          failure: `${FRONTEND_BASE}/portal/subscription?provider=mercadopago&status=failure`,
          pending: `${FRONTEND_BASE}/portal/subscription?provider=mercadopago&status=pending`,
        },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { init_point?: string; id?: string; message?: string };
    if (!res.ok || !body.init_point) {
      throw new BadRequestException(body.message ?? 'Failed to create Mercado Pago checkout');
    }
    return { provider: 'mercadopago', checkoutUrl: body.init_point, reference: body.id ?? externalReference };
  }

  async createExtraCheckout(userId: string, input: ExtraCheckoutInput): Promise<CheckoutResult> {
    await this.requireClient(userId);
    if (input.provider !== 'mercadopago') throw new BadRequestException('Invalid provider');
    const extra = EXTRAS_CATALOG[input.extraType];
    if (!extra) throw new BadRequestException('Invalid extraType');
    const quantity = Math.max(1, Math.min(10, Number(input.quantity ?? 1)));

    const accessToken = this.getMercadoPagoToken();
    const externalReference = encodeExternalReference({
      userId,
      paymentKind: 'extra',
      extraType: input.extraType,
      quantity: String(quantity),
      provider: 'mercadopago',
    });

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: extra.title,
            quantity,
            currency_id: 'ARS',
            unit_price: extra.ars,
          },
        ],
        external_reference: externalReference,
        metadata: {
          userId,
          paymentKind: 'extra',
          extraType: input.extraType,
          quantity,
          provider: 'mercadopago',
        },
        auto_return: 'approved',
        back_urls: {
          success: `${FRONTEND_BASE}/portal/extra-services?provider=mercadopago&status=success`,
          failure: `${FRONTEND_BASE}/portal/extra-services?provider=mercadopago&status=failure`,
          pending: `${FRONTEND_BASE}/portal/extra-services?provider=mercadopago&status=pending`,
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { init_point?: string; id?: string; message?: string };
    if (!res.ok || !body.init_point) {
      throw new BadRequestException(body.message ?? 'Failed to create Mercado Pago checkout');
    }
    return { provider: 'mercadopago', checkoutUrl: body.init_point, reference: body.id ?? externalReference };
  }

  private async createPayPalExtrasCartOrder(
    user: { id: string; email: string; name: string },
    lines: { title: string; usd: number }[],
    totalUsd: number,
  ): Promise<CheckoutResult> {
    const token = await this.getPayPalAccessToken();
    const base = this.getPayPalApiBase();
    const valueStr = totalUsd.toFixed(2);
    const items = lines.map((l) => ({
      name: l.title.length > 120 ? `${l.title.slice(0, 117)}...` : l.title,
      unit_amount: { currency_code: 'USD', value: l.usd.toFixed(2) },
      quantity: '1',
      category: 'DIGITAL_GOODS' as const,
    }));
    const res = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'extras_cart',
            custom_id: user.id,
            description: `Servicios extras (${lines.length})`,
            amount: {
              currency_code: 'USD',
              value: valueStr,
              breakdown: {
                item_total: { currency_code: 'USD', value: valueStr },
              },
            },
            items,
          },
        ],
        application_context: {
          brand_name: 'Astar',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${FRONTEND_BASE}/portal/orders?provider=paypal&status=success`,
          cancel_url: `${FRONTEND_BASE}/portal/orders?provider=paypal&status=cancelled`,
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      links?: { href: string; rel: string; method?: string }[];
      message?: string;
    };
    if (!res.ok || !body.id) {
      throw new BadRequestException(typeof body.message === 'string' ? body.message : 'Failed to create PayPal order');
    }
    const approve = body.links?.find((l) => l.rel === 'approve' && l.method === 'GET');
    if (!approve?.href) {
      throw new BadRequestException('PayPal approval URL missing');
    }
    return { provider: 'paypal', checkoutUrl: approve.href, reference: body.id };
  }

  private async createPayPalSubscriptionOrder(
    user: { id: string; email: string; name: string },
    plan: Plan,
    billing: Billing,
  ): Promise<CheckoutResult> {
    const config = SUBSCRIPTION_CATALOG[plan];
    const amount = config.usd[billing];
    const valueStr = amount.toFixed(2);
    const label = billing === 'monthly' ? 'Mensual' : 'Anual';
    const itemName = `${config.title} (${label})`.slice(0, 127);
    const referenceId = `subscription:${plan}:${billing}`;

    const token = await this.getPayPalAccessToken();
    const base = this.getPayPalApiBase();
    const res = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: referenceId,
            custom_id: user.id,
            description: itemName,
            amount: {
              currency_code: 'USD',
              value: valueStr,
              breakdown: {
                item_total: { currency_code: 'USD', value: valueStr },
              },
            },
            items: [
              {
                name: itemName,
                unit_amount: { currency_code: 'USD', value: valueStr },
                quantity: '1',
                category: 'DIGITAL_GOODS',
              },
            ],
          },
        ],
        application_context: {
          brand_name: 'Astar',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${FRONTEND_BASE}/portal/subscription?provider=paypal&status=success`,
          cancel_url: `${FRONTEND_BASE}/portal/subscription?provider=paypal&status=cancelled`,
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      links?: { href: string; rel: string; method?: string }[];
      message?: string;
    };
    if (!res.ok || !body.id) {
      throw new BadRequestException(typeof body.message === 'string' ? body.message : 'Failed to create PayPal order');
    }
    const approve = body.links?.find((l) => l.rel === 'approve' && l.method === 'GET');
    if (!approve?.href) {
      throw new BadRequestException('PayPal approval URL missing');
    }
    return { provider: 'paypal', checkoutUrl: approve.href, reference: body.id };
  }

  async createExtrasCartCheckout(userId: string, input: { provider: 'mercadopago' | 'paypal' }): Promise<CheckoutResult> {
    const user = await this.requireClient(userId);
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { extrasCartServiceIds: true },
    });
    const ids = row?.extrasCartServiceIds ?? [];
    if (ids.length === 0) throw new BadRequestException('Tu carrito está vacío');

    const isSub = user.subscriptionStatus === 'active';
    const lines: { id: string; title: string; usd: number; ars: number }[] = [];
    for (const id of ids) {
      const p = PORTAL_EXTRA_SERVICES[id];
      if (!p) throw new BadRequestException('Carrito inválido');
      const usd = isSub ? p.usdSub : p.usdGuest;
      const ars = Math.round(usd * 1450);
      lines.push({ id, title: p.title, usd, ars });
    }
    const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
    const serviceIdsCsv = ids.join(',');

    if (input.provider === 'paypal') {
      return this.createPayPalExtrasCartOrder(
        user,
        lines.map((l) => ({ title: l.title, usd: l.usd })),
        totalUsd,
      );
    }

    if (input.provider !== 'mercadopago') throw new BadRequestException('Invalid provider');

    const accessToken = this.getMercadoPagoToken();
    const externalReference = encodeExternalReference({
      userId,
      paymentKind: 'extras_cart',
      serviceIds: serviceIdsCsv,
      provider: 'mercadopago',
    });

    const mpItems = lines.map((l) => ({
      title: l.title.length > 250 ? `${l.title.slice(0, 247)}…` : l.title,
      quantity: 1,
      currency_id: 'ARS',
      unit_price: l.ars,
    }));

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: mpItems,
        external_reference: externalReference,
        metadata: {
          userId,
          paymentKind: 'extras_cart',
          serviceIds: serviceIdsCsv,
          provider: 'mercadopago',
        },
        auto_return: 'approved',
        back_urls: {
          success: `${FRONTEND_BASE}/portal/orders?provider=mercadopago&status=success`,
          failure: `${FRONTEND_BASE}/portal/orders?provider=mercadopago&status=failure`,
          pending: `${FRONTEND_BASE}/portal/orders?provider=mercadopago&status=pending`,
        },
      }),
    });
    const mpBody = (await res.json().catch(() => ({}))) as { init_point?: string; id?: string; message?: string };
    if (!res.ok || !mpBody.init_point) {
      throw new BadRequestException(mpBody.message ?? 'Failed to create Mercado Pago checkout');
    }
    return { provider: 'mercadopago', checkoutUrl: mpBody.init_point, reference: mpBody.id ?? externalReference };
  }

  /** Order shape after GET or capture (PayPal Orders v2). */
  private parsePayPalOrderCompletedBody(order: PayPalCompletedOrderShape): {
    amountVal: string;
    currency: string;
    referenceId: string;
  } {
    const pu0 = order.purchase_units?.[0];
    const capture = pu0?.payments?.captures?.[0];
    const amountVal = capture?.amount?.value ?? pu0?.amount?.value ?? '0';
    const currency = capture?.amount?.currency_code ?? pu0?.amount?.currency_code ?? 'USD';
    const referenceId = pu0?.reference_id ?? '';
    return { amountVal, currency, referenceId };
  }

  private async applyPayPalFulfillmentFromCompletedOrder(
    userId: string,
    orderId: string,
    order: PayPalCompletedOrderShape,
  ): Promise<{
    ok: true;
    provider: 'paypal';
    paymentKind: 'subscription' | 'extras_cart';
    subscriptionStatus?: 'active';
  }> {
    const { amountVal, currency, referenceId } = this.parsePayPalOrderCompletedBody(order);

    if (referenceId.startsWith('subscription:')) {
      const parts = referenceId.split(':');
      if (parts.length !== 3) throw new BadRequestException('Invalid PayPal subscription order');
      const plan = parts[1] as Plan;
      const billing = parts[2] as Billing;
      if (!SUBSCRIPTION_CATALOG[plan] || (billing !== 'monthly' && billing !== 'annual')) {
        throw new BadRequestException('Invalid subscription metadata on PayPal order');
      }
      const type = `subscription:${plan}:${billing}`;
      await this.createOrderIfMissing({
        userId,
        type,
        amount: `${amountVal} ${currency}`,
        method: `paypal:${orderId}`,
      });
      await this.usersService.updateSubscription(userId, 'active');
      await this.ensureSubscriptionReports(userId, plan);
      return {
        ok: true,
        provider: 'paypal' as const,
        paymentKind: 'subscription' as const,
        subscriptionStatus: 'active' as const,
      };
    }

    if (referenceId === 'extras_cart') {
      const snapshot = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { extrasCartServiceIds: true },
      });
      const type = `extras_cart:${(snapshot?.extrasCartServiceIds ?? []).join('|') || 'paid'}`;

      await this.createOrderIfMissing({
        userId,
        type,
        amount: `${amountVal} ${currency}`,
        method: `paypal:${orderId}`,
      });
      await this.clearExtrasCart(userId);

      return {
        ok: true,
        provider: 'paypal' as const,
        paymentKind: 'extras_cart' as const,
      };
    }

    throw new BadRequestException('Unknown PayPal order type');
  }

  async confirmPayPalOrder(userId: string, orderId: string) {
    await this.requireClient(userId);
    if (!orderId?.trim()) throw new BadRequestException('orderId is required');

    const accessToken = await this.getPayPalAccessToken();
    const base = this.getPayPalApiBase();

    const getRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const existing = (await getRes.json().catch(() => ({}))) as PayPalCompletedOrderShape & {
      purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
    };
    if (!getRes.ok) throw new BadRequestException('Invalid PayPal order');
    const customId = existing.purchase_units?.[0]?.custom_id;
    if (customId !== userId) throw new ForbiddenException('PayPal order does not belong to user');

    let capBody: PayPalCompletedOrderShape;

    if (existing.status === 'COMPLETED') {
      capBody = existing;
    } else {
      const capRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      });
      capBody = (await capRes.json().catch(() => ({}))) as PayPalCompletedOrderShape;
      if (!capRes.ok || capBody.status !== 'COMPLETED') {
        throw new BadRequestException(
          (capBody as { message?: string }).message ?? 'PayPal capture failed',
        );
      }
    }

    return this.applyPayPalFulfillmentFromCompletedOrder(userId, orderId, capBody);
  }

  async handlePayPalWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<{ received: true; processed: boolean; detail?: string }> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (webhookId) {
      const ok = await this.verifyPayPalWebhookSignature(input.headers, input.body, webhookId);
      if (!ok) {
        this.logger.warn('PayPal webhook signature verification failed');
        throw new UnauthorizedException('Invalid PayPal webhook signature');
      }
    } else {
      this.logger.warn(
        'PAYPAL_WEBHOOK_ID is not set; PayPal webhook signatures are not verified (set it in production).',
      );
    }

    const event = input.body as Record<string, unknown>;
    const eventType = typeof event.event_type === 'string' ? event.event_type : '';

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      return { received: true, processed: false, detail: eventType || 'ignored' };
    }

    const resource = event.resource as Record<string, unknown> | undefined;
    const orderId = this.extractPayPalOrderIdFromCaptureWebhookResource(resource);
    if (!orderId) {
      return { received: true, processed: false, detail: 'no_order_id' };
    }

    let accessToken: string;
    try {
      accessToken = await this.getPayPalAccessToken();
    } catch {
      this.logger.error('PayPal webhook: missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
      return { received: true, processed: false, detail: 'missing_paypal_credentials' };
    }

    const base = this.getPayPalApiBase();
    const getRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const order = (await getRes.json().catch(() => ({}))) as PayPalCompletedOrderShape & {
      purchase_units?: Array<{ custom_id?: string }>;
    };
    if (!getRes.ok) {
      return { received: true, processed: false, detail: 'order_fetch_failed' };
    }

    if (order.status !== 'COMPLETED') {
      return { received: true, processed: false, detail: `order_${order.status ?? 'unknown'}` };
    }

    const userId = order.purchase_units?.[0]?.custom_id?.trim();
    if (!userId) {
      return { received: true, processed: false, detail: 'no_custom_id' };
    }

    try {
      await this.applyPayPalFulfillmentFromCompletedOrder(userId, orderId, order);
      this.logger.log(`PayPal webhook fulfilled order ${orderId} for user ${userId}`);
      return { received: true, processed: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`PayPal webhook fulfill failed for ${orderId}: ${msg}`);
      return { received: true, processed: false, detail: 'fulfill_error' };
    }
  }

  private extractPayPalOrderIdFromCaptureWebhookResource(
    resource: Record<string, unknown> | undefined,
  ): string | null {
    if (!resource) return null;
    const sup = resource.supplementary_data as Record<string, unknown> | undefined;
    const related = sup?.related_ids as Record<string, unknown> | undefined;
    const oid = related?.order_id;
    if (typeof oid === 'string' && oid.trim()) return oid.trim();
    return null;
  }

  private async verifyPayPalWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    webhookId: string,
  ): Promise<boolean> {
    const authAlgo = this.getHeader(headers, 'paypal-auth-algo');
    const certUrl = this.getHeader(headers, 'paypal-cert-url');
    const transmissionId = this.getHeader(headers, 'paypal-transmission-id');
    const transmissionSig = this.getHeader(headers, 'paypal-transmission-sig');
    const transmissionTime = this.getHeader(headers, 'paypal-transmission-time');
    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      return false;
    }

    let accessToken: string;
    try {
      accessToken = await this.getPayPalAccessToken();
    } catch {
      return false;
    }

    const base = this.getPayPalApiBase();
    const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: body,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { verification_status?: string };
    return res.ok && data.verification_status === 'SUCCESS';
  }

  private async createOrderIfMissing(params: {
    userId: string;
    type: string;
    amount: string;
    method: string;
  }) {
    const existing = await this.prisma.order.findFirst({
      where: { userId: params.userId, method: params.method },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.order.create({ data: params });
    return created.id;
  }

  private getReportTypesForPlan(plan: string | undefined): ReportType[] {
    const normalized = (plan ?? '').toLowerCase() as Plan | '';
    if (normalized === 'essentials') {
      return ['birth_chart', 'numerology'];
    }
    // Portal and Depth get all core reports.
    return ['birth_chart', 'solar_return', 'numerology'];
  }

  private isLegacyAutoDraft(type: ReportType, content: string | null): boolean {
    if (!content) return true;
    const normalized = content.toLowerCase();
    if (type === 'birth_chart') {
      return normalized.includes('tu carta de base') && normalized.includes('cómo usar este reporte');
    }
    if (type === 'solar_return') {
      return normalized.includes('apertura de ciclo anual') && normalized.includes('integración práctica');
    }
    return normalized.includes('interpretación inicial') && normalized.includes('esta versión base se ampliará');
  }

  private buildReportDraft(
    type: ReportType,
    user: { name?: string | null; birthDate?: string | null; birthPlace?: string | null; birthTime?: string | null },
  ): { title: string; content: string } {
    const firstName = (user.name ?? 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
    const birthDate = normalizeBirthDate(user.birthDate);
    const birthParts = parseBirthDateParts(user.birthDate);
    const birthPlace = user.birthPlace?.trim() || 'tu lugar de nacimiento';
    const birthTime = user.birthTime?.trim() || 'tu hora de nacimiento';
    const lifePath = calculateLifePathNumber(user.birthDate);
    const sunSign = getSunSignFromBirthDate(user.birthDate);
    const nameNumbers = mapNameCharsToNumber(user.name ?? '');
    const birthdayNumber = birthParts ? calculateBirthdayNumber(birthParts.day) : null;
    const attitudeNumber = birthParts ? calculateAttitudeNumber(birthParts.month, birthParts.day) : null;
    const currentYear = new Date().getFullYear();
    const personalYear = birthParts ? calculatePersonalYear(birthParts.month, birthParts.day, currentYear) : null;

    if (type === 'birth_chart') {
      return {
        title: 'Carta Natal',
        content: JSON.stringify([
          {
            id: 'datos-base',
            title: 'Datos de nacimiento utilizados',
            content: `Nombre: ${user.name ?? firstName}\nFecha: ${birthDate ?? 'pendiente'}\nHora: ${birthTime}\nLugar: ${birthPlace}`,
          },
          {
            id: 'eje-identidad',
            title: 'Eje de identidad natal',
            content: sunSign
              ? `Tu Sol de nacimiento se ubica en ${sunSign}. Este eje describe tu forma natural de expresarte, decidir y orientar tu energía vital.`
              : 'Para calcular con precisión tu eje solar necesitamos una fecha de nacimiento válida en tu perfil.',
          },
          {
            id: 'guia-practica',
            title: 'Guía práctica de lectura',
            content:
              'Usa esta carta como mapa base: 1) observa tus patrones repetidos, 2) cruza hallazgos con tus decisiones actuales, 3) integra tus mensajes mensuales para aterrizar acciones.',
          },
        ]),
      };
    }

    if (type === 'solar_return') {
      return {
        title: 'Revolución Solar',
        content: JSON.stringify({
          theme: {
            title: 'Apertura de ciclo anual',
            subtitle: `Tu revolución solar para ${firstName} ya está habilitada.`,
          },
          sections: [
            {
              id: 'cycle',
              title: 'Enfoque del año',
              content:
                'La Revolución Solar marca el tono de tu ciclo anual entre cumpleaños. Este informe inicia tu seguimiento del año y se complementa con tus mensajes y preguntas del portal.',
            },
            {
              id: 'timing',
              title: 'Timing recomendado',
              content:
                'Te sugerimos revisar este reporte al comienzo de cada mes para detectar prioridades, ajustar foco y tomar decisiones con más contexto.',
            },
            {
              id: 'contexto',
              title: 'Contexto de nacimiento aplicado',
              content:
                `Base registrada: ${birthDate ?? 'fecha pendiente'} - ${birthTime} - ${birthPlace}. Con estos datos podrás contrastar tu ciclo anual con tu carta natal.`,
            },
          ],
        }),
      };
    }

    return {
      title: 'Numerología',
      content: JSON.stringify({
        numbers: [
          {
            number: lifePath ?? '—',
            label: 'Camino de Vida',
            desc: lifePath
              ? `Derivado de tu fecha de nacimiento (${birthDate}).`
              : 'Completa tu fecha de nacimiento para calcularlo automáticamente.',
          },
          {
            number: birthdayNumber != null ? String(birthdayNumber) : '—',
            label: 'Número de Nacimiento',
            desc: birthdayNumber != null ? `Reduce el día ${birthParts?.day} a vibración esencial.` : 'Disponible cuando registres una fecha válida.',
          },
          {
            number: attitudeNumber != null ? String(attitudeNumber) : '—',
            label: 'Número de Actitud',
            desc: attitudeNumber != null ? `Suma mes + día (${birthParts?.month} + ${birthParts?.day}).` : 'Disponible cuando registres una fecha válida.',
          },
          {
            number: personalYear != null ? String(personalYear) : '—',
            label: `Año Personal ${currentYear}`,
            desc: personalYear != null ? 'Marca la energía del año en curso para tus decisiones.' : 'Disponible cuando registres una fecha válida.',
          },
          {
            number: nameNumbers.expression != null ? String(nameNumbers.expression) : '—',
            label: 'Número de Expresión',
            desc: nameNumbers.expression != null ? 'Calculado con letras de tu nombre completo.' : 'Disponible cuando tengas nombre válido en tu perfil.',
          },
          {
            number: nameNumbers.soulUrge != null ? String(nameNumbers.soulUrge) : '—',
            label: 'Número del Alma',
            desc: nameNumbers.soulUrge != null ? 'Derivado de vocales de tu nombre.' : 'Disponible cuando tengas nombre válido en tu perfil.',
          },
          {
            number: nameNumbers.personality != null ? String(nameNumbers.personality) : '—',
            label: 'Número de Personalidad',
            desc: nameNumbers.personality != null ? 'Derivado de consonantes de tu nombre.' : 'Disponible cuando tengas nombre válido en tu perfil.',
          },
        ],
        interpretations: [
          {
            id: 'camino',
            title: `Camino de Vida ${lifePath ?? '—'}`,
            content: lifePath
              ? `Tu Camino de Vida ${lifePath} enfatiza ${numberMeaning(lifePath)}. En la práctica, este número sugiere cómo avanzar con más coherencia personal.`
              : 'Completa una fecha de nacimiento válida para desbloquear esta interpretación.',
          },
          {
            id: 'nacimiento',
            title: `Número de Nacimiento ${birthdayNumber ?? '—'}`,
            content: birthdayNumber != null
              ? `Tu número de nacimiento aporta un talento natural orientado a ${numberMeaning(birthdayNumber)}.`
              : 'Disponible cuando registres una fecha de nacimiento válida.',
          },
          {
            id: 'actitud',
            title: `Actitud ${attitudeNumber ?? '—'}`,
            content: attitudeNumber != null
              ? `Este número describe tu primera impresión y enfoque espontáneo: ${numberMeaning(attitudeNumber)}.`
              : 'Disponible cuando registres una fecha de nacimiento válida.',
          },
          {
            id: 'anio',
            title: `Año Personal ${currentYear}: ${personalYear ?? '—'}`,
            content: personalYear != null
              ? `Durante ${currentYear}, predomina una energía asociada a ${numberMeaning(personalYear)}. Úsala para priorizar decisiones y ritmo.`
              : 'Disponible cuando registres una fecha de nacimiento válida.',
          },
          {
            id: 'nombre',
            title: 'Eje del Nombre (Expresión/Alma/Personalidad)',
            content:
              nameNumbers.expression != null && nameNumbers.soulUrge != null && nameNumbers.personality != null
                ? `Expresión ${nameNumbers.expression}: ${numberMeaning(nameNumbers.expression)}. Alma ${nameNumbers.soulUrge}: ${numberMeaning(nameNumbers.soulUrge)}. Personalidad ${nameNumbers.personality}: ${numberMeaning(nameNumbers.personality)}.`
                : 'Con un nombre completo válido, este eje mostrará cómo comunicas tu potencial, tu motivación interna y tu forma de presentarte.',
          },
          {
            id: 'integracion',
            title: 'Claves de integración',
            content:
              'Integra tus números en acciones concretas: define 1 prioridad mensual, 1 hábito sostenible y 1 criterio de decisión alineado con tu ciclo personal.',
          },
        ],
      }),
    };
  }

  /**
   * Si el usuario tiene suscripción activa y aún no tiene filas de reporte (p. ej. pago confirmado sin webhook),
   * crea los borradores base. El plan se infiere del último pedido `subscription:…` si existe; si no, conjunto portal/depth.
   */
  async syncSubscriptionReportsIfNeeded(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;
    const isAdmin = user.role === 'admin';
    if (!isAdmin && user.subscriptionStatus !== 'active') return;
    const plan = isAdmin ? undefined : await this.inferSubscriptionPlanFromOrders(userId);
    await this.ensureSubscriptionReports(userId, plan);
  }

  private async inferSubscriptionPlanFromOrders(userId: string): Promise<string | undefined> {
    const order = await this.prisma.order.findFirst({
      where: { userId, type: { startsWith: 'subscription:' } },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });
    if (!order?.type) return undefined;
    const parts = order.type.split(':');
    if (parts.length >= 2 && parts[0] === 'subscription') return parts[1];
    return undefined;
  }

  private async ensureSubscriptionReports(userId: string, plan: string | undefined): Promise<void> {
    const requiredTypes = this.getReportTypesForPlan(plan);
    const user = await this.usersService.findById(userId);
    if (!user) return;

    const existing = await this.prisma.report.findMany({
      where: { userId, type: { in: requiredTypes } },
      select: { id: true, type: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const latestByType = new Map<ReportType, (typeof existing)[number]>();
    for (const row of existing) {
      if (!latestByType.has(row.type as ReportType)) {
        latestByType.set(row.type as ReportType, row);
      }
    }

    for (const type of requiredTypes) {
      const latest = latestByType.get(type);
      const draft = this.buildReportDraft(type, user);
      if (!latest) {
        await this.prisma.report.create({
          data: {
            userId,
            type,
            title: draft.title,
            content: draft.content,
          },
        });
        continue;
      }

      // Upgrade only our old low-detail autogenerated drafts, never custom/admin reports.
      if (this.isLegacyAutoDraft(type, latest.content)) {
        await this.prisma.report.update({
          where: { id: latest.id },
          data: {
            title: draft.title,
            content: draft.content,
          },
        });
      }
    }
  }

  private async fulfillMercadoPagoApprovedPayment(
    userId: string,
    params: {
      paymentId: string;
      transactionAmount: number;
      currencyId: string;
      externalReference: string;
      metadata: Record<string, string | undefined>;
    },
  ) {
    const refData = decodeExternalReference(params.externalReference);
    const metadata = params.metadata ?? {};
    const ownerUserId = metadata.userId ?? refData.userId;
    if (ownerUserId !== userId) throw new ForbiddenException('Payment does not belong to user');

    const paymentKind = (metadata.paymentKind ?? refData.paymentKind) as
      | 'subscription'
      | 'extra'
      | 'extras_cart'
      | undefined;
    if (!paymentKind) throw new BadRequestException('Missing payment metadata');

    const method = `mercadopago:${params.paymentId}`;
    const amount = `${params.transactionAmount.toFixed(2)} ${(params.currencyId ?? 'ARS').toUpperCase()}`;
    const type =
      paymentKind === 'subscription'
        ? `subscription:${metadata.plan ?? refData.plan ?? 'portal'}:${metadata.billing ?? refData.billing ?? 'monthly'}`
        : paymentKind === 'extras_cart'
          ? `extras_cart:${metadata.serviceIds ?? refData.serviceIds ?? 'unknown'}`
          : `extra:${metadata.extraType ?? refData.extraType ?? 'extra_question'}:${metadata.quantity ?? refData.quantity ?? '1'}`;

    await this.createOrderIfMissing({
      userId,
      type,
      amount,
      method,
    });

    if (paymentKind === 'subscription') {
      await this.usersService.updateSubscription(userId, 'active');
      await this.ensureSubscriptionReports(userId, metadata.plan ?? refData.plan);
    }

    if (paymentKind === 'extras_cart') {
      await this.clearExtrasCart(userId);
    }

    return {
      ok: true as const,
      provider: 'mercadopago' as const,
      paymentKind,
      subscriptionStatus: paymentKind === 'subscription' ? ('active' as const) : undefined,
    };
  }

  async processMercadoPagoCardPayment(
    userId: string,
    input: {
      flow: 'subscription' | 'extras_cart';
      plan?: Plan;
      billing?: Billing;
      token: string;
      issuerId?: string;
      paymentMethodId: string;
      installments: number;
      transactionAmount: number;
      payerEmail: string;
      payerIdentification?: { type: string; number: string };
    },
  ) {
    const user = await this.requireClient(userId);
    const accessToken = this.getMercadoPagoToken();

    let expectedAmount: number;
    let description: string;
    let externalReference: string;
    const metadata: Record<string, string> = {
      userId,
      provider: 'mercadopago',
    };

    if (input.flow === 'subscription') {
      if (!input.plan || !input.billing) throw new BadRequestException('plan and billing are required');
      const config = SUBSCRIPTION_CATALOG[input.plan];
      if (!config) throw new BadRequestException('Invalid plan');
      expectedAmount = config.ars[input.billing];
      description = `${config.title} (${input.billing === 'monthly' ? 'Mensual' : 'Anual'})`;
      externalReference = encodeExternalReference({
        userId,
        paymentKind: 'subscription',
        plan: input.plan,
        billing: input.billing,
        provider: 'mercadopago',
      });
      metadata.paymentKind = 'subscription';
      metadata.plan = input.plan;
      metadata.billing = input.billing;
    } else {
      metadata.paymentKind = 'extras_cart';
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { extrasCartServiceIds: true },
      });
      const ids = row?.extrasCartServiceIds ?? [];
      if (ids.length === 0) throw new BadRequestException('Tu carrito está vacío');
      const isSub = user.subscriptionStatus === 'active';
      const lines: { title: string; ars: number }[] = [];
      let totalArs = 0;
      for (const id of ids) {
        const p = PORTAL_EXTRA_SERVICES[id];
        if (!p) throw new BadRequestException('Carrito inválido');
        const usd = isSub ? p.usdSub : p.usdGuest;
        const ars = Math.round(usd * 1450);
        lines.push({ title: p.title, ars });
        totalArs += ars;
      }
      expectedAmount = totalArs;
      description = lines.length === 1 ? lines[0].title : `Servicios extras (${lines.length} ítems)`;
      const serviceIdsCsv = ids.join(',');
      externalReference = encodeExternalReference({
        userId,
        paymentKind: 'extras_cart',
        serviceIds: serviceIdsCsv,
        provider: 'mercadopago',
      });
      metadata.serviceIds = serviceIdsCsv;
    }

    if (!Number.isFinite(input.transactionAmount) || Math.abs(input.transactionAmount - expectedAmount) > 0.01) {
      throw new BadRequestException('El monto del pago no coincide con el total.');
    }

    const installments = Math.max(1, Math.min(Math.floor(Number(input.installments) || 1), 18));
    if (!input.token?.trim()) throw new BadRequestException('Token de tarjeta inválido');
    if (!input.paymentMethodId?.trim()) throw new BadRequestException('Medio de pago inválido');

    const payer: Record<string, unknown> = {
      email: input.payerEmail.trim().toLowerCase(),
    };
    if (input.payerIdentification?.type?.trim() && input.payerIdentification?.number?.trim()) {
      payer.identification = {
        type: input.payerIdentification.type.trim(),
        number: input.payerIdentification.number.replace(/\s/g, ''),
      };
    }

    const paymentPayload: Record<string, unknown> = {
      transaction_amount: expectedAmount,
      token: input.token.trim(),
      description: description.length > 250 ? `${description.slice(0, 247)}…` : description,
      installments,
      payment_method_id: input.paymentMethodId.trim(),
      payer,
      external_reference: externalReference,
      metadata,
      binary_mode: true,
      statement_descriptor: 'ASTAR',
    };

    const issuerRaw = input.issuerId?.trim();
    if (issuerRaw && issuerRaw !== '0') {
      const issuerNum = Number(issuerRaw);
      if (Number.isFinite(issuerNum)) paymentPayload.issuer_id = issuerNum;
    }

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(paymentPayload),
    });

    const payBody = (await res.json().catch(() => ({}))) as {
      id?: number;
      status?: string;
      status_detail?: string;
      message?: string;
      cause?: Array<{ description?: string }>;
      transaction_amount?: number;
      currency_id?: string;
    };

    if (!res.ok) {
      const fromCause = payBody.cause?.map((c) => c.description).filter(Boolean).join(' ') ?? '';
      throw new BadRequestException(fromCause || payBody.message || 'Mercado Pago rechazó el pago');
    }

    if (payBody.status !== 'approved') {
      const detail = payBody.status_detail ?? 'El pago no fue aprobado.';
      const human =
        payBody.status_detail === 'cc_rejected_insufficient_amount' ? 'Fondos insuficientes.' : detail;
      throw new BadRequestException(human);
    }

    const paidAmount = payBody.transaction_amount ?? expectedAmount;
    const currency = payBody.currency_id ?? 'ARS';
    if (Math.abs(paidAmount - expectedAmount) > 0.01) {
      throw new BadRequestException('El monto acreditado no coincide.');
    }

    const paymentIdStr = String(payBody.id ?? '');
    if (!paymentIdStr) throw new BadRequestException('Respuesta inválida de Mercado Pago');

    const result = await this.fulfillMercadoPagoApprovedPayment(userId, {
      paymentId: paymentIdStr,
      transactionAmount: paidAmount,
      currencyId: currency,
      externalReference,
      metadata,
    });

    return { ...result, paymentId: paymentIdStr };
  }

  async confirmMercadoPagoPayment(userId: string, paymentId: string) {
    await this.requireClient(userId);
    if (!paymentId?.trim()) throw new BadRequestException('paymentId is required');

    const accessToken = this.getMercadoPagoToken();
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: number;
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      external_reference?: string;
      metadata?: Record<string, string>;
      message?: string;
    };

    if (!res.ok) throw new BadRequestException(body.message ?? 'Failed to validate Mercado Pago payment');
    if (body.status !== 'approved') throw new BadRequestException('Mercado Pago payment is not approved');

    return this.fulfillMercadoPagoApprovedPayment(userId, {
      paymentId: String(body.id ?? paymentId),
      transactionAmount: body.transaction_amount ?? 0,
      currencyId: body.currency_id ?? 'ARS',
      externalReference: body.external_reference ?? '',
      metadata: body.metadata ?? {},
    });
  }

  async cancelSubscription(userId: string) {
    await this.requireClient(userId);
    await this.usersService.updateSubscription(userId, 'cancelled');
    return { ok: true, subscriptionStatus: 'cancelled' as const };
  }

  /**
   * Mercado Pago webhooks / IPN: fetch payment by id and fulfill if approved (idempotent).
   * Configure URL in MP dashboard: POST (and optionally GET for legacy IPN) → /payments/webhooks/mercadopago
   */
  async handleMercadoPagoWebhook(input: {
    method: 'GET' | 'POST';
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    query: Record<string, string | undefined>;
  }): Promise<{ received: true; processed: boolean; detail?: string }> {
    const paymentId = this.extractMercadoPagoWebhookPaymentId(input.body, input.query);
    if (!paymentId) {
      return { received: true, processed: false, detail: 'no_payment_id' };
    }

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
    if (secret) {
      const hasSig =
        Boolean(this.getHeader(input.headers, 'x-signature')) &&
        Boolean(this.getHeader(input.headers, 'x-request-id'));
      if (hasSig) {
        const ok = this.verifyMercadoPagoWebhookSignature(input.headers, paymentId, secret);
        if (!ok) {
          this.logger.warn(`Mercado Pago webhook signature check failed for payment ${paymentId}`);
          throw new UnauthorizedException('Invalid webhook signature');
        }
      } else if (input.method === 'POST') {
        this.logger.warn(`Mercado Pago POST webhook missing x-signature / x-request-id for payment ${paymentId}`);
        throw new UnauthorizedException('Missing webhook signature');
      } else {
        this.logger.warn(
          `Mercado Pago GET notification for payment ${paymentId} without signature (legacy IPN). Prefer POST webhooks.`,
        );
      }
    } else {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET is not set; webhook signatures are not verified (set it in production).',
      );
    }

    let accessToken: string;
    try {
      accessToken = this.getMercadoPagoToken();
    } catch {
      this.logger.error('MERCADOPAGO_ACCESS_TOKEN missing; cannot process webhook');
      return { received: true, processed: false, detail: 'missing_access_token' };
    }

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const pay = (await res.json().catch(() => ({}))) as {
      id?: number;
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      external_reference?: string;
      metadata?: Record<string, unknown>;
      message?: string;
    };

    if (!res.ok) {
      this.logger.warn(`Mercado Pago GET payment ${paymentId} failed: ${pay.message ?? res.status}`);
      return { received: true, processed: false, detail: 'fetch_failed' };
    }

    if (pay.status !== 'approved') {
      return { received: true, processed: false, detail: `status_${pay.status ?? 'unknown'}` };
    }

    const metadata = this.normalizeMercadoPagoMetadata(pay.metadata);
    const externalReference = pay.external_reference ?? '';
    const refData = decodeExternalReference(externalReference);
    const userId = metadata.userId ?? refData.userId;
    if (!userId?.trim()) {
      this.logger.warn(`Mercado Pago payment ${paymentId} approved but no userId in metadata/reference`);
      return { received: true, processed: false, detail: 'no_user_id' };
    }

    try {
      await this.fulfillMercadoPagoApprovedPayment(userId.trim(), {
        paymentId: String(pay.id ?? paymentId),
        transactionAmount: pay.transaction_amount ?? 0,
        currencyId: pay.currency_id ?? 'ARS',
        externalReference,
        metadata,
      });
      this.logger.log(`Mercado Pago webhook fulfilled payment ${paymentId} for user ${userId}`);
      return { received: true, processed: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Mercado Pago webhook fulfill failed for ${paymentId}: ${msg}`);
      return { received: true, processed: false, detail: 'fulfill_error' };
    }
  }

  private extractMercadoPagoWebhookPaymentId(
    body: unknown,
    query: Record<string, string | undefined>,
  ): string | null {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const o = body as Record<string, unknown>;
      const bodyType = typeof o.type === 'string' ? o.type.toLowerCase() : '';
      if (bodyType && bodyType !== 'payment') {
        return null;
      }
      const data = o.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const id = (data as Record<string, unknown>).id;
        if (id != null) {
          const s = String(id).trim();
          if (s) return s;
        }
      }
    }

    const topic = (query.topic ?? '').toLowerCase();
    const qId = query.id ?? query['data.id'];
    if (qId?.trim() && (topic === 'payment' || topic === 'payment_notification' || topic === '')) {
      return qId.trim();
    }
    return null;
  }

  private normalizeMercadoPagoMetadata(raw: Record<string, unknown> | undefined): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v == null ? undefined : String(v);
    }
    return out;
  }

  /**
   * @see https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks
   */
  private verifyMercadoPagoWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    dataId: string,
    secret: string,
  ): boolean {
    const signatureHeader = this.getHeader(headers, 'x-signature');
    const requestId = this.getHeader(headers, 'x-request-id');
    if (!signatureHeader || !requestId) return false;

    let ts = '';
    let v1 = '';
    for (const part of signatureHeader.split(',')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key === 'ts') ts = value;
      if (key === 'v1') v1 = value;
    }
    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(v1, 'utf8');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (Array.isArray(v)) return v[0];
      return v;
    }
    return undefined;
  }
}

