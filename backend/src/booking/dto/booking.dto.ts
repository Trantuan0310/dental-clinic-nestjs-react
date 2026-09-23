import { BookingRequestStatus, Gender } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePublicBookingRequestDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) fullName!: string;
  @ApiProperty() @IsDateString() dob!: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender) gender!: Gender;
  @ApiProperty() @IsString() @MinLength(9) @MaxLength(20) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contactPersonName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) contactPersonPhone?: string;
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @ApiProperty() @IsBoolean() consent!: boolean;
}
export class UpdatePublicBookingDetailsDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) fullName!: string;
  @ApiProperty() @IsDateString() dob!: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender) gender!: Gender;
  @ApiProperty() @IsString() @MinLength(9) @MaxLength(20) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contactPersonName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) contactPersonPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class PublicSlotsQueryDto {
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty({ example: '2026-10-01' }) @IsString() date!: string;
}
export class ProposeBookingTimeDto {
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(1000) message!: string;
}
export class BookingRequestMessageDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) message!: string;
}
export class ConfirmBookingRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;
}

export class ListBookingRequestsDto {
  @ApiPropertyOptional({ enum: BookingRequestStatus })
  @IsOptional() @IsEnum(BookingRequestStatus) status?: BookingRequestStatus;
}
