import { ApiPropertyOptional } from '@nestjs/swagger';
import { SecurityEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryAuditEventsDto {
  @ApiPropertyOptional({
    example: 50,
    description: 'Maximum number of security events to return (max 100)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({
    example: 0,
    description: 'Number of security events to skip for pagination',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({
    enum: SecurityEventType,
    description: 'Optional filter by security event type',
  })
  @IsOptional()
  @IsEnum(SecurityEventType)
  eventType?: SecurityEventType;
}
