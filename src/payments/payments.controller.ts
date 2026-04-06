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
    @Body() body: { provider: 'stripe' | 'mercadopago'; plan: 'essentials' | 'portal' | 'depth'; billing: 'monthly' | 'annual'; embedded?: boolean },
  ) {
    return this.paymentsService.createSubscriptionCheckout(user.id, body);
  }

  @Post('extra/checkout')
  async createExtraCheckout(
    @CurrentUser() user: { id: string },
    @Body() body: { provider: 'stripe' | 'mercadopago'; extraType: 'extra_question' | 'private_session'; quantity?: number },
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

  @Post('confirm/stripe')
  async confirmStripeSession(
    @CurrentUser() user: { id: string },
    @Body() body: { sessionId: string },
  ) {
    return this.paymentsService.confirmStripeSession(user.id, body.sessionId?.trim());
  }

  @Post('confirm/stripe-intent')
  async confirmStripePaymentIntent(
    @CurrentUser() user: { id: string },
    @Body() body: { paymentIntentId: string },
  ) {
    return this.paymentsService.confirmStripePaymentIntent(user.id, body.paymentIntentId?.trim());
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

