import { IsInt, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  @IsIn(['bullet', 'blitz', 'rapid', 'classical'])
  variant: string;

  @IsInt()
  @Min(10)
  @Max(10800)
  timeControl: number;

  @IsInt()
  @Min(0)
  @Max(180)
  @IsOptional()
  increment?: number;

  @IsString()
  @IsIn(['white', 'black', 'random'])
  @IsOptional()
  creatorColor?: string;
}
