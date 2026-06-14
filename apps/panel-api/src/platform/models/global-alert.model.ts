import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Code-first GraphQL projection of the GlobalAlert entity. Severity is exposed
 * as a plain string for the same decoupling reasons as elsewhere in the schema.
 */
@ObjectType('GlobalAlert')
export class GlobalAlertModel {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  severity!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field()
  isActive!: boolean;

  @Field(() => Date, { nullable: true })
  startsAt?: Date | null;

  @Field(() => Date, { nullable: true })
  endsAt?: Date | null;

  @Field()
  createdAt!: Date;
}
