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
import { GlobalRole } from '@prisma/client';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  AddPaymentMethodDto,
  CreatePriceDto,
  CreateProductDto,
  CreateSubscriptionDto,
} from './dto';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ---- Catalog -----------------------------------------------------------

  /**
   * Public-safe payment config for the client checkout: whether each gateway is
   * enabled + the Stripe publishable key (not a secret). No secrets returned.
   */
  @Get('config')
  paymentConfig() {
    return this.billing.gatewayStatus();
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
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  @Audit({ action: 'billing.product.create', targetType: 'Product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billing.createProduct(dto);
  }

  @Post('prices')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
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
  payInvoice(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.billing.payInvoice(userId, id);
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
