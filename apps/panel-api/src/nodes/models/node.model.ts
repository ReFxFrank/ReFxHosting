import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Node')
export class NodeModel {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  fqdn!: string;

  @Field()
  os!: string;

  @Field()
  state!: string;

  @Field()
  maintenance!: boolean;

  @Field(() => Int)
  cpuCores!: number;

  @Field(() => Int)
  memoryMb!: number;

  @Field(() => Int)
  diskMb!: number;

  @Field(() => Float, { nullable: true })
  cpuOvercommit?: number;

  @Field({ nullable: true })
  agentVersion?: string;

  @Field()
  createdAt!: Date;
}
