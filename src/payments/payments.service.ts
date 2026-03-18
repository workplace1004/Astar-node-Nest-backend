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

function calculateLifePathNumber(birthDate: string | null | undefined): string | null {
  const normalized = normalizeBirthDate(birthDate);
  if (!normalized) return null;
  const digits = normalized.replace(/-/g, '').split('').map((d) => Number(d));
  if (digits.some((d) => Number.isNaN(d))) return null;

  const reduce = (n: number): number => {
    // Preserve master numbers.
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n)
        .split('')
        .map((d) => Number(d))
        .reduce((acc, curr) => acc + curr, 0);
    }
    return n;
  };

  const total = digits.reduce((acc, curr) => acc + curr, 0);
  return String(reduce(total));
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
          success: `${FRONTEND_BASE}/subscribe?provider=mercadopago&status=success`,
          failure: `${FRONTEND_BASE}/subscribe?provider=mercadopago&status=failure`,
          pending: `${FRONTEND_BASE}/subscribe?provider=mercadopago&status=pending`,
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

  private buildReportDraft(
    type: ReportType,
    user: { name?: string | null; birthDate?: string | null; birthPlace?: string | null; birthTime?: string | null },
  ): { title: string; content: string } {
    const firstName = (user.name ?? 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
    const birthDate = normalizeBirthDate(user.birthDate);
    const birthPlace = user.birthPlace?.trim() || 'tu lugar de nacimiento';
    const birthTime = user.birthTime?.trim() || 'tu hora de nacimiento';
    const lifePath = calculateLifePathNumber(user.birthDate);

    if (type === 'birth_chart') {
      return {
        title: 'Carta Natal',
        content: JSON.stringify([
          {
            id: 'base-1',
            title: 'Tu carta de base',
            content: `Hola ${firstName}. Activamos tu Carta Natal con los datos de nacimiento registrados (${birthDate ?? 'fecha pendiente'}, ${birthTime}, ${birthPlace}).`,
          },
          {
            id: 'base-2',
            title: 'Cómo usar este reporte',
            content:
              'Esta versión inicial te sirve como punto de partida. Desde el panel podrás recibir versiones ampliadas y personalizadas según tu proceso.',
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
              id: 'focus',
              title: 'Enfoque del año',
              content:
                'Este reporte se activa con tu suscripción y se irá enriqueciendo con contenidos de seguimiento durante el año.',
            },
            {
              id: 'integration',
              title: 'Integración práctica',
              content:
                'Te recomendamos revisarlo junto con tus mensajes y preguntas para conectar los tránsitos con decisiones concretas.',
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
            desc: lifePath ? `Calculado desde tu fecha de nacimiento registrada (${birthDate}).` : 'Completa tu fecha de nacimiento para calcularlo automáticamente.',
          },
        ],
        interpretations: [
          {
            id: 'base',
            title: 'Interpretación inicial',
            content:
              'Activamos tu reporte de numerología. Esta versión base se ampliará con más capas interpretativas dentro del portal.',
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
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((r) => r.type));

    const missingTypes = requiredTypes.filter((type) => !existingTypes.has(type));
    if (missingTypes.length === 0) return;

    await Promise.all(
      missingTypes.map((type) => {
        const draft = this.buildReportDraft(type, user);
        return this.prisma.report.create({
          data: {
            userId,
            type,
            title: draft.title,
            content: draft.content,
          },
        });
      }),
    );
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

