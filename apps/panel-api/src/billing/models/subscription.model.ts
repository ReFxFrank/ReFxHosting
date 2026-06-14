import { Field, ID, ObjectType } from '@nestjs/graphql';

/** Code-first GraphQL projection of the Subscription entity. */
@ObjectType('Subscription')
export class SubscriptionModel {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  productId!: string;

  @Field(() => ID)
  priceId!: string;

  @Field(() => String)
  interval!: string;

  @Field(() => String)
  state!: string;

  @Field()
  currentPeriodStart!: Date;

  @Field()
  currentPeriodEnd!: Date;

  @Field()
  cancelAtPeriodEnd!: boolean;

  @Field()
  autoRenew!: boolean;

  @Field(() => String)
  gateway!: string;

  @Field()
  createdAt!: Date;
}
