import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Invoice, Product, Subscription } from '@prisma/client';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ProductModel } from './models/product.model';
import { SubscriptionModel } from './models/subscription.model';
import { InvoiceModel } from './models/invoice.model';

@Resolver()
@UseGuards(JwtAuthGuard)
export class BillingResolver {
  constructor(private readonly billing: BillingService) {}

  /** Public catalog of active products. */
  @Query(() => [ProductModel], { name: 'products' })
  async products(): Promise<ProductModel[]> {
    const products = await this.billing.listProducts();
    return products.map(BillingResolver.toProduct);
  }

  /** The caller's subscriptions. */
  @Query(() => [SubscriptionModel], { name: 'mySubscriptions' })
  async mySubscriptions(
    @CurrentUser() user: AuthUser,
  ): Promise<SubscriptionModel[]> {
    const subs = await this.billing.listSubscriptions(user.id);
    return subs.map(BillingResolver.toSubscription);
  }

  /** The caller's invoices (page slice). */
  @Query(() => [InvoiceModel], { name: 'myInvoices' })
  async myInvoices(
    @CurrentUser() user: AuthUser,
    @Args('pagination', { nullable: true }) pagination?: PaginationDto,
  ): Promise<InvoiceModel[]> {
    const page = await this.billing.listInvoices(
      user.id,
      pagination ?? new PaginationDto(),
    );
    return page.data.map(BillingResolver.toInvoice);
  }

  // ---- mappers -----------------------------------------------------------

  private static toProduct(p: Product): ProductModel {
    return {
      id: p.id,
      type: p.type,
      name: p.name,
      slug: p.slug,
      description: p.description,
      isActive: p.isActive,
      cpuCores: p.cpuCores,
      memoryMb: p.memoryMb,
      diskMb: p.diskMb,
      slots: p.slots,
      createdAt: p.createdAt,
    };
  }

  private static toSubscription(s: Subscription): SubscriptionModel {
    return {
      id: s.id,
      productId: s.productId,
      priceId: s.priceId,
      interval: s.interval,
      state: s.state,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      autoRenew: s.autoRenew,
      gateway: s.gateway,
      createdAt: s.createdAt,
    };
  }

  private static toInvoice(i: Invoice): InvoiceModel {
    return {
      id: i.id,
      number: i.number,
      subscriptionId: i.subscriptionId,
      state: i.state,
      currency: i.currency,
      subtotalMinor: i.subtotalMinor,
      taxMinor: i.taxMinor,
      totalMinor: i.totalMinor,
      amountPaidMinor: i.amountPaidMinor,
      taxType: i.taxType,
      taxRatePct: i.taxRatePct,
      dueAt: i.dueAt,
      paidAt: i.paidAt,
      createdAt: i.createdAt,
    };
  }
}
