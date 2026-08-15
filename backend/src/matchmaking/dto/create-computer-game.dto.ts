import { IsInt, IsOptional, Max, Min } from 'class-validator';

// See CreateChallengeDto: `variant` is derived from `timeControl`, never taken
// from the client.
export class CreateComputerGameDto {
  /** 1=depth1, 2=depth3, 3=depth5, 4=depth10, 5=depth15 (Stockfish). */
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number;

  @IsInt()
  @Min(10)
  @Max(10800)
  timeControl: number;

  @IsInt()
  @Min(0)
  @Max(180)
  @IsOptional()
  increment?: number;
}
