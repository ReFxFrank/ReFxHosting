import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/** Code-first GraphQL projection of a knowledge-base article. */
@ObjectType('KbArticle')
export class KbArticleModel {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field({ nullable: true })
  category?: string | null;

  @Field()
  isPublished!: boolean;

  @Field(() => Int)
  views!: number;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
