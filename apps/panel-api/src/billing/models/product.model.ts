import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Code-first GraphQL projection of the Product entity. Enums are exposed as
 * strings to keep the public schema decoupled from Prisma identifiers.
 */
@ObjectType('Product')
export class ProductModel {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  type!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field()
  isActive!: boolean;

  @Field(() => Float, { nullable: true })
  cpuCores?: number | null;

  @Field(() => Int, { nullable: true })
  memoryMb?: number | null;

  @Field(() => Int, { nullable: true })
  diskMb?: number | null;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

  @Field()
  createdAt!: Date;
}
