import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UsersRepository } from '../users/users.repository.js';
import { toUserResponse } from './dto/auth-response.dto.js';
import type { LoginInput } from './dto/login.dto.js';
import type { RegisterInput } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.users.create({
        name: input.name,
        email: input.email,
        passwordHash,
      });

      return toUserResponse(user);
    } catch (error: any) {
      if (error.cause?.code === '23505') {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer' as const,
      expiresIn: 3600,
      user: toUserResponse(user),
    };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    return toUserResponse(user);
  }
}
