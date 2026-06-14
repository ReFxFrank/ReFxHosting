import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/** Code-first GraphQL projection of the Invoice entity (money in minor units). */
@ObjectType('Invoice')
export class InvoiceModel {
  @Field(() => ID)
  id!: string;

  @Field()
  number!: string;

  @Field(() => ID, { nullable: true })
  subscriptionId?: string | null;

  @Field(() => String)
  state!: string;

  @Field()
  currency!: string;

  @Field(() => Int)
  subtotalMinor!: number;

  @Field(() => Int)
  taxMinor!: number;

  @Field(() => Int)
  totalMinor!: number;

  @Field(() => Int)
  amountPaidMinor!: number;

  @Field(() => String, { nullable: true })
  taxType?: string | null;

  @Field(() => Float, { nullable: true })
  taxRatePct?: number | null;

  @Field(() => Date, { nullable: true })
  dueAt?: Date | null;

  @Field(() => Date, { nullable: true })
  paidAt?: Date | null;

  @Field()
  createdAt!: Date;
}
