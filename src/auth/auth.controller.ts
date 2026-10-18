import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { loginSchema, type LoginInput } from './dto/login.dto.js';
import { registerSchema, type RegisterInput } from './dto/register.dto.js';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) input: RegisterInput) {
    return this.authService.register(input);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) input: LoginInput) {
    return this.authService.login(input);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: { user: { id: string } }) {
    return this.authService.me(request.user.id);
  }
}
