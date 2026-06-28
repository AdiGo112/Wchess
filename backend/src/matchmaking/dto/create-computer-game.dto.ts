import { IsInt, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateComputerGameDto {
  /** 1=depth1, 2=depth3, 3=depth5, 4=depth10, 5=depth15 (Stockfish). */
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number;

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
}
