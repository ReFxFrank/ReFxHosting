import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Server')
export class ServerModel {
  @Field()
  id!: string;

  @Field()
  shortId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  state!: string;

  @Field()
  deployMethod!: string;

  /** GAME_SERVER | VOICE_SERVER — the authoritative voice/game discriminator. */
  @Field()
  serverType!: string;

  @Field(() => Float)
  cpuCores!: number;

  @Field(() => Int)
  memoryMb!: number;

  @Field(() => Int)
  diskMb!: number;

  @Field({ nullable: true })
  templateId?: string;

  @Field(() => Int, { nullable: true })
  templateVersion?: number;

  @Field()
  createdAt!: Date;
}

@ObjectType('GameSwitchLog')
export class GameSwitchLogModel {
  @Field()
  id!: string;

  @Field({ nullable: true })
  fromTemplate?: string;

  @Field()
  toTemplate!: string;

  @Field()
  preservedData!: boolean;

  @Field()
  createdAt!: Date;
}
