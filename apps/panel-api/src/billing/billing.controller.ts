import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ReferralsService } from './referrals.service';
import { CouponsService } from './coupons.service';
import { GiftCardsService } from './gift-cards.service';
import { CreditService } from './credit.service';
import { ValidateCouponDto } from './dto/coupon.dto';
import { RedeemGiftCardDto } from './dto/gift-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RequirePerm } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  AddPaymentMethodDto,
  ConfirmSetupDto,
  CreatePriceDto,
  CreateProductDto,
  CreateSubscriptionDto,
} from './dto';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly referrals: ReferralsService,
    private readonly coupons: CouponsService,
    private readonly giftCards: GiftCardsService,
    private readonly credit: CreditService,
  ) {}

  /** The caller's store-credit balance + recent ledger (account credit panel). */
  @Get('credit')
  async myCredit(@CurrentUser('id') userId: string) {
    const [balanceMinor, transactions] = await Promise.all([
      this.credit.balance(userId),
      this.credit.listTransactions(userId),
    ]);
    return { balanceMinor, transactions };
  }

  /** Validate a coupon for a given subtotal (order-page preview). */
  @Post('coupons/validate')
  @HttpCode(200)
  async validateCoupon(
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateCouponDto,
  ) {
    const { coupon, discountMinor } = await this.coupons.validate(
      dto.code,
      userId,
      dto.subtotalMinor,
    );
    return {
      valid: true,
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      discountMinor,
    };
  }

  /** Look up a gift card's remaining balance (order-page preview). */
  @Post('gift-cards/lookup')
  @HttpCode(200)
  async lookupGiftCard(@Body() dto: RedeemGiftCardDto) {
    const card = await this.giftCards.lookup(dto.code);
    return { code: card.code, balanceMinor: card.balanceMinor, currency: card.currency };
  }

  // ---- Catalog -----------------------------------------------------------

  /**
   * Public-safe payment config for the client checkout: whether each gateway is
   * enabled + the Stripe publishable key (not a secret). No secrets returned.
   */
  @Get('config')
  paymentConfig() {
    return this.billing.gatewayStatus();
  }

  /** The caller's referral code + earnings (code created on first request). */
  @Get('referral')
  myReferral(@CurrentUser('id') userId: string) {
    return this.referrals.myReferral(userId);
  }

  @Get('products')
  listProducts() {
    return this.billing.listProducts();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.billing.getProduct(id);
  }

  @Post('products')
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('catalog.manage')
  @Audit({ action: 'billing.product.create', targetType: 'Product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billing.createProduct(dto);
  }

  @Post('prices')
  @UseGuards(AdminPermissionGuard)
  @RequirePerm('catalog.manage')
  @Audit({ action: 'billing.price.create', targetType: 'Price' })
  createPrice(@Body() dto: CreatePriceDto) {
    return this.billing.createPrice(dto);
  }

  // ---- Subscriptions -----------------------------------------------------

  @Get('subscriptions')
  listSubscriptions(@CurrentUser('id') userId: string) {
    return this.billing.listSubscriptions(userId);
  }

  @Post('subscriptions')
  @Audit({ action: 'billing.subscription.create', targetType: 'Subscription' })
  createSubscription(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.billing.createSubscription(userId, dto);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(200)
  @Audit({
    action: 'billing.subscription.cancel',
    targetType: 'Subscription',
    targetParam: 'id',
  })
  cancelSubscription(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('atPeriodEnd') atPeriodEnd?: string,
  ) {
    // Default to cancel-at-period-end unless explicitly set to false.
    const atEnd = atPeriodEnd !== 'false';
    return this.billing.cancelSubscription(userId, id, atEnd);
  }

  @Post('subscriptions/:id/resume')
  @HttpCode(200)
  @Audit({
    action: 'billing.subscription.resume',
    targetType: 'Subscription',
    targetParam: 'id',
  })
  resumeSubscription(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.billing.resumeSubscription(userId, id);
  }

  // ---- Invoices ----------------------------------------------------------

  @Get('invoices')
  listInvoices(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.billing.listInvoices(userId, pagination);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.billing.getInvoice(userId, id);
  }

  @Post('invoices/:id/pay')
  @HttpCode(200)
  @Audit({ action: 'billing.invoice.pay', targetType: 'Invoice', targetParam: 'id' })
  payInvoice(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('gateway') gateway?: 'stripe' | 'paypal',
  ) {
    return this.billing.payInvoice(userId, id, gateway);
  }

  /** Capture an approved PayPal order on return and settle the invoice. */
  @Post('paypal/capture')
  @HttpCode(200)
  @Audit({ action: 'billing.paypal.capture', targetType: 'Invoice' })
  capturePaypal(
    @CurrentUser('id') userId: string,
    @Query('token') token: string,
  ) {
    return this.billing.capturePayPal(userId, token);
  }

  /** Pay the open invoice for one of the caller's servers (Pay-now button). */
  @Post('servers/:serverId/pay')
  @HttpCode(200)
  @Audit({ action: 'billing.server.pay', targetType: 'Server', targetParam: 'serverId' })
  payForServer(
    @CurrentUser('id') userId: string,
    @Param('serverId') serverId: string,
    @Query('gateway') gateway?: 'stripe' | 'paypal',
  ) {
    return this.billing.payForServer(userId, serverId, gateway);
  }

  // ---- Payment methods ---------------------------------------------------

  @Get('payment-methods')
  listPaymentMethods(@CurrentUser('id') userId: string) {
    return this.billing.listPaymentMethods(userId);
  }

  @Post('payment-methods')
  @Audit({ action: 'billing.payment_method.add', targetType: 'PaymentMethod' })
  addPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: AddPaymentMethodDto,
  ) {
    return this.billing.addPaymentMethod(userId, dto);
  }

  @Post('payment-methods/setup')
  @HttpCode(200)
  @Audit({ action: 'billing.payment_method.setup', targetType: 'PaymentMethod' })
  setupPaymentMethod(@CurrentUser('id') userId: string) {
    return this.billing.createSetupIntent(userId);
  }

  /** Persist the card after the browser confirms the SetupIntent. */
  @Post('payment-methods/confirm')
  @HttpCode(200)
  @Audit({ action: 'billing.payment_method.confirm', targetType: 'PaymentMethod' })
  confirmPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmSetupDto,
  ) {
    return this.billing.savePaymentMethodFromSetup(userId, dto.setupIntentId);
  }

  @Post('payment-methods/:id/default')
  @HttpCode(200)
  @Audit({
    action: 'billing.payment_method.default',
    targetType: 'PaymentMethod',
    targetParam: 'id',
  })
  setDefaultPaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.billing.setDefaultPaymentMethod(userId, id);
  }

  @Delete('payment-methods/:id')
  @HttpCode(204)
  @Audit({
    action: 'billing.payment_method.remove',
    targetType: 'PaymentMethod',
    targetParam: 'id',
  })
  removePaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.billing.removePaymentMethod(userId, id);
  }
}
