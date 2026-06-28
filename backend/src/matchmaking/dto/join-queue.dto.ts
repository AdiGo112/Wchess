import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class JoinQueueDto {
  /** Base clock per side, in seconds (10s .. 3h). */
  @IsInt()
  @Min(10)
  @Max(10800)
  timeControl: number;

  /** Fischer increment per move, in seconds. Defaults to 0. */
  @IsInt()
  @Min(0)
  @Max(180)
  @IsOptional()
  increment?: number;
}

export class LeaveQueueDto {
  @IsInt()
  @Min(10)
  @Max(10800)
  timeControl: number;
}
