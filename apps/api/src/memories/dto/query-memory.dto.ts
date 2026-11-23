import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryMemoryDto {
  @ApiPropertyOptional({ example: false, description: 'Whether to include archived memories' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ example: '2026-11-23', description: 'Filter by entry date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Maximum number of memories to return (max 100)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'uuid', description: 'Cursor ID for pagination' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
