import { IsInt, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

// No `variant` field: the service always re-derives it from `timeControl`
// (variantFromTimeControl) so it can't contradict the variant the game is
// actually rated under. Accepting one here validated an input nobody read —
// { variant: 'bullet', timeControl: 1800 } passed and was then scored as rapid.
export class CreateChallengeDto {
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
