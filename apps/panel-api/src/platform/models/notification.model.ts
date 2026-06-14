import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Code-first GraphQL projection of the Notification entity. The channel enum is
 * exposed as a plain string to keep the public schema decoupled from Prisma's
 * enum identifiers (matching the convention used for User).
 */
@ObjectType('Notification')
export class NotificationModel {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  channel!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field({ nullable: true })
  readAt?: Date | null;

  @Field()
  createdAt!: Date;
}
