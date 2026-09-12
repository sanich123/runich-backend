import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class LoadTestSeedRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  runId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^load-test\/[a-z0-9][a-z0-9_\-/]{0,500}\/manifest\.json$/)
  manifestKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  followerCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  activitiesPerFollower?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  activityLikesPerActivity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  commentsPerActivity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  commentLikesPerComment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  photosPerActivity?: number;
}
