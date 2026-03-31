import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type Provider = 'stripe' | 'mercadopago';
type Billing = 'monthly' | 'annual';
type Plan = 'essentials' | 'portal' | 'depth';
type ExtraType = 'extra_question' | 'private_session';
type ReportType = 'birth_chart' | 'solar_return' | 'numerology';

export interface CheckoutResult {
  provider: Provider;
  checkoutUrl: string;
  reference: string;
  mode?: 'custom';
  stripeClientSecret?: string;
  stripePublishableKey?: string;
  stripePaymentIntentId?: string;
}

interface SubscriptionCheckoutInput {
  provider: Provider;
  plan: Plan;
  billing: Billing;
  embedded?: boolean;
}

interface ExtraCheckoutInput {
  provider: Provider;
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
    title: 'Astar Portal',
    usd: { monthly: 39, annual: 29 },
    ars: { monthly: 39000, annual: 29000 },
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
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  private async requireClient(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.role !== 'client') throw new ForbiddenException('Payments are for client users only');
    return user;
  }

  private getStripeClient(): Stripe {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new BadRequestException('Missing STRIPE_SECRET_KEY');
    return new Stripe(secret);
  }

  private getMercadoPagoToken(): string {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new BadRequestException('Missing MERCADOPAGO_ACCESS_TOKEN');
    return token;
  }

  async createSubscriptionCheckout(userId: string, input: SubscriptionCheckoutInput): Promise<CheckoutResult> {
    const user = await this.requireClient(userId);

    const config = SUBSCRIPTION_CATALOG[input.plan];
    if (!config) throw new BadRequestException('Invalid plan');

    if (input.provider === 'stripe') {
      if (!process.env.STRIPE_SECRET_KEY) throw new BadRequestException('Missing STRIPE_SECRET_KEY');
      const stripe = this.getStripeClient();
      const amount = config.usd[input.billing];
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) throw new BadRequestException('Missing STRIPE_PUBLISHABLE_KEY');
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: user.email,
        metadata: {
          userId,
          paymentKind: 'subscription',
          plan: input.plan,
          billing: input.billing,
        },
      });

      if (!paymentIntent.client_secret) {
        throw new BadRequestException('Stripe payment intent client secret not available');
      }

      return {
        provider: 'stripe',
        checkoutUrl: '',
        reference: paymentIntent.id,
        mode: 'custom',
        stripeClientSecret: paymentIntent.client_secret,
        stripePublishableKey: publishableKey,
        stripePaymentIntentId: paymentIntent.id ?? undefined,
      };
    }

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
    const extra = EXTRAS_CATALOG[input.extraType];
    if (!extra) throw new BadRequestException('Invalid extraType');
    const quantity = Math.max(1, Math.min(10, Number(input.quantity ?? 1)));

    if (input.provider === 'stripe') {
      const stripe = this.getStripeClient();
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) throw new BadRequestException('Missing STRIPE_PUBLISHABLE_KEY');
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(extra.usd * 100) * quantity,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId,
          paymentKind: 'extra',
          extraType: input.extraType,
          quantity: String(quantity),
        },
      });
      if (!paymentIntent.client_secret) {
        throw new BadRequestException('Stripe payment intent client secret not available');
      }
      return {
        provider: 'stripe',
        checkoutUrl: '',
        reference: paymentIntent.id,
        mode: 'custom',
        stripeClientSecret: paymentIntent.client_secret,
        stripePublishableKey: publishableKey,
        stripePaymentIntentId: paymentIntent.id,
      };
    }

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
          success: `${FRONTEND_BASE}/portal/purchase?provider=mercadopago&status=success`,
          failure: `${FRONTEND_BASE}/portal/purchase?provider=mercadopago&status=failure`,
          pending: `${FRONTEND_BASE}/portal/purchase?provider=mercadopago&status=pending`,
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { init_point?: string; id?: string; message?: string };
    if (!res.ok || !body.init_point) {
      throw new BadRequestException(body.message ?? 'Failed to create Mercado Pago checkout');
    }
    return { provider: 'mercadopago', checkoutUrl: body.init_point, reference: body.id ?? externalReference };
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

  async confirmStripeSession(userId: string, sessionId: string) {
    await this.requireClient(userId);
    if (!sessionId?.trim()) throw new BadRequestException('sessionId is required');

    const stripe = this.getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id !== userId) {
      throw new ForbiddenException('Session does not belong to user');
    }
    if (session.status !== 'complete') {
      throw new BadRequestException('Stripe payment is not completed');
    }

    const metadata = session.metadata ?? {};
    const paymentKind = metadata.paymentKind as 'subscription' | 'extra' | undefined;
    if (!paymentKind) throw new BadRequestException('Missing payment metadata');

    const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
    const currency = (session.currency ?? 'usd').toUpperCase();
    const method = `stripe:${session.id}`;
    const type =
      paymentKind === 'subscription'
        ? `subscription:${metadata.plan ?? 'portal'}:${metadata.billing ?? 'monthly'}`
        : `extra:${metadata.extraType ?? 'extra_question'}:${metadata.quantity ?? '1'}`;

    await this.createOrderIfMissing({
      userId,
      type,
      amount: `${amount} ${currency}`,
      method,
    });

    if (paymentKind === 'subscription') {
      await this.usersService.updateSubscription(userId, 'active');
      await this.ensureSubscriptionReports(userId, metadata.plan);
    }

    return {
      ok: true,
      provider: 'stripe' as const,
      paymentKind,
      subscriptionStatus: paymentKind === 'subscription' ? 'active' : undefined,
    };
  }

  async confirmStripePaymentIntent(userId: string, paymentIntentId: string) {
    await this.requireClient(userId);
    if (!paymentIntentId?.trim()) throw new BadRequestException('paymentIntentId is required');

    const stripe = this.getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata ?? {};
    if (metadata.userId !== userId) {
      throw new ForbiddenException('Payment intent does not belong to user');
    }
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Stripe payment is not completed');
    }

    const paymentKind = (metadata.paymentKind as 'subscription' | 'extra' | undefined) ?? 'subscription';
    const type =
      paymentKind === 'subscription'
        ? `subscription:${metadata.plan ?? 'portal'}:${metadata.billing ?? 'monthly'}`
        : `extra:${metadata.extraType ?? 'extra_question'}:${metadata.quantity ?? '1'}`;
    await this.createOrderIfMissing({
      userId,
      type,
      amount: `${((paymentIntent.amount ?? 0) / 100).toFixed(2)} ${(paymentIntent.currency ?? 'USD').toUpperCase()}`,
      method: `stripe_intent:${paymentIntent.id}`,
    });
    if (paymentKind === 'subscription') {
      await this.usersService.updateSubscription(userId, 'active');
      await this.ensureSubscriptionReports(userId, metadata.plan);
    }

    return {
      ok: true,
      provider: 'stripe' as const,
      paymentKind: paymentKind as 'subscription' | 'extra',
      subscriptionStatus: paymentKind === 'subscription' ? ('active' as const) : undefined,
    };
  }

  async confirmMercadoPagoPayment(userId: string, paymentId: string) {
    await this.requireClient(userId);
    if (!paymentId?.trim()) throw new BadRequestException('paymentId is required');

    const accessToken = this.getMercadoPagoToken();
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      external_reference?: string;
      metadata?: Record<string, string>;
      message?: string;
    };

    if (!res.ok) throw new BadRequestException(body.message ?? 'Failed to validate Mercado Pago payment');
    if (body.status !== 'approved') throw new BadRequestException('Mercado Pago payment is not approved');

    const refData = decodeExternalReference(body.external_reference);
    const metadata = body.metadata ?? {};
    const ownerUserId = metadata.userId ?? refData.userId;
    if (ownerUserId !== userId) throw new ForbiddenException('Payment does not belong to user');

    const paymentKind = (metadata.paymentKind ?? refData.paymentKind) as 'subscription' | 'extra' | undefined;
    if (!paymentKind) throw new BadRequestException('Missing payment metadata');

    const method = `mercadopago:${paymentId}`;
    const amount = `${(body.transaction_amount ?? 0).toFixed(2)} ${(body.currency_id ?? 'ARS').toUpperCase()}`;
    const type =
      paymentKind === 'subscription'
        ? `subscription:${metadata.plan ?? refData.plan ?? 'portal'}:${metadata.billing ?? refData.billing ?? 'monthly'}`
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

    return {
      ok: true,
      provider: 'mercadopago' as const,
      paymentKind,
      subscriptionStatus: paymentKind === 'subscription' ? 'active' : undefined,
    };
  }

  async cancelSubscription(userId: string) {
    await this.requireClient(userId);
    await this.usersService.updateSubscription(userId, 'cancelled');
    return { ok: true, subscriptionStatus: 'cancelled' as const };
  }
}

