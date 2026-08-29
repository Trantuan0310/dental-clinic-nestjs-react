import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  // No body required - token comes from cookie
  @ApiProperty({ description: 'No body required - refresh token from cookie' })
  data?: Record<string, never>;
}
