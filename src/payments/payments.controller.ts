import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('subscription/checkout')
  async createSubscriptionCheckout(
    @CurrentUser() user: { id: string },
    @Body() body: { provider: 'mercadopago' | 'paypal'; plan: 'portal'; billing: 'monthly' | 'annual' },
  ) {
    return this.paymentsService.createSubscriptionCheckout(user.id, body);
  }

  @Post('extra/checkout')
  async createExtraCheckout(
    @CurrentUser() user: { id: string },
    @Body() body: { provider: 'mercadopago'; extraType: 'extra_question' | 'private_session'; quantity?: number },
  ) {
    return this.paymentsService.createExtraCheckout(user.id, body);
  }

  @Post('extras-cart/checkout')
  async createExtrasCartCheckout(
    @CurrentUser() user: { id: string },
    @Body() body: { provider: 'mercadopago' | 'paypal' },
  ) {
    return this.paymentsService.createExtrasCartCheckout(user.id, body);
  }

  @Post('mercadopago/card')
  async processMercadoPagoCard(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      flow: 'subscription' | 'extras_cart';
      plan?: 'portal';
      billing?: 'monthly' | 'annual';
      token: string;
      issuerId?: string;
      paymentMethodId: string;
      installments: number;
      transactionAmount: number;
      payerEmail: string;
      payerIdentification?: { type: string; number: string };
    },
  ) {
    return this.paymentsService.processMercadoPagoCardPayment(user.id, {
      flow: body.flow,
      plan: body.plan,
      billing: body.billing,
      token: body.token?.trim() ?? '',
      issuerId: body.issuerId,
      paymentMethodId: body.paymentMethodId?.trim() ?? '',
      installments: body.installments,
      transactionAmount: body.transactionAmount,
      payerEmail: body.payerEmail?.trim() ?? '',
      payerIdentification: body.payerIdentification,
    });
  }

  @Post('confirm/mercadopago')
  async confirmMercadoPagoPayment(
    @CurrentUser() user: { id: string },
    @Body() body: { paymentId: string },
  ) {
    return this.paymentsService.confirmMercadoPagoPayment(user.id, body.paymentId?.trim());
  }

  @Post('confirm/paypal')
  async confirmPayPalOrder(@CurrentUser() user: { id: string }, @Body() body: { orderId: string }) {
    return this.paymentsService.confirmPayPalOrder(user.id, body.orderId?.trim());
  }

  @Post('subscription/cancel')
  async cancelSubscription(@CurrentUser() user: { id: string }) {
    return this.paymentsService.cancelSubscription(user.id);
  }
}

