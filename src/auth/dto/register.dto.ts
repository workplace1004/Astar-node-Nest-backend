import { IsEmail, IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate!: string;

  @IsString()
  @IsNotEmpty()
  birthPlace!: string;

  @Matches(/^\d{2}:\d{2}$/)
  birthTime!: string;
}
