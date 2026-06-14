import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Code-first GraphQL projection of the User entity. Enums are exposed as plain
 * strings to keep the public schema decoupled from Prisma's enum identifiers.
 */
@ObjectType('User')
export class UserModel {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  firstName?: string | null;

  @Field(() => String, { nullable: true })
  lastName?: string | null;

  @Field(() => String)
  globalRole!: string;

  @Field(() => String)
  state!: string;

  @Field()
  createdAt!: Date;
}
