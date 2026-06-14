import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Code-first GraphQL projection of the Ticket entity. Enums are exposed as
 * plain strings to keep the public schema decoupled from Prisma identifiers.
 */
@ObjectType('Ticket')
export class TicketModel {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  number!: number;

  @Field()
  subject!: string;

  @Field(() => String)
  state!: string;

  @Field(() => String)
  priority!: string;

  @Field()
  createdAt!: Date;

  @Field()
  slaBreached!: boolean;
}
