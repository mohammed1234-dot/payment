import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Every environment variable the app reads, validated once at boot.
 * A missing or malformed value stops the process with a clear message
 * instead of failing later in the middle of a request.
 *
 * Variables are added here in the phase that starts using them.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL: string;

  /**
   * Server-side only, never logged or sent to a client. A standard (sk_) or
   * restricted (rk_) key. Optional until the Stripe phase makes it required.
   */
  @IsOptional()
  @Matches(/^(sk|rk)_(test|live)_\w+$/, {
    message: 'STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_...)',
  })
  STRIPE_SECRET_KEY?: string;

  /** Printed by `stripe listen` locally, or shown on the webhook endpoint in the Dashboard. */
  @IsOptional()
  @Matches(/^whsec_\w+$/, {
    message: 'STRIPE_WEBHOOK_SECRET must start with whsec_',
  })
  STRIPE_WEBHOOK_SECRET?: string;
}

/**
 * Test keys everywhere except production, live keys only in production,
 * so a developer machine can never move real money.
 */
function checkStripeKeyMode(env: EnvironmentVariables): string[] {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return [];
  const isLive = key.includes('_live_');
  if (env.NODE_ENV === NodeEnv.Production && !isLive) {
    return ['STRIPE_SECRET_KEY must be a live key in production'];
  }
  if (env.NODE_ENV !== NodeEnv.Production && isLive) {
    return [
      `STRIPE_SECRET_KEY must be a test key (sk_test_...) when NODE_ENV is ${env.NODE_ENV}`,
    ];
  }
  return [];
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const messages = validateSync(validated, {
    skipMissingProperties: false,
  }).flatMap((error) => Object.values(error.constraints ?? {}));
  if (messages.length === 0) {
    messages.push(...checkStripeKeyMode(validated));
  }
  if (messages.length > 0) {
    throw new Error(
      `Invalid environment variables:\n  - ${messages.join('\n  - ')}`,
    );
  }
  return validated;
}
