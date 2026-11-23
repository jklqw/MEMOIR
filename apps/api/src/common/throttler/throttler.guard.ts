import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_SKIP = 'THROTTLER:SKIP';

@Injectable()
export class MemoirThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Check if default throttler skip is specified (e.g., via @SkipThrottle())
    const isDefaultSkipped = this.reflector.getAllAndOverride<boolean>(`${THROTTLER_SKIP}default`, [
      handler,
      classRef,
    ]);
    if (isDefaultSkipped) {
      return true;
    }

    return super.shouldSkip(context);
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Check if this route has explicitly skipped this specific throttler
    const isSkipped = this.reflector.getAllAndOverride<boolean>(
      `${THROTTLER_SKIP}${throttler.name}`,
      [handler, classRef],
    );
    if (isSkipped) {
      return true;
    }

    const hasAuthLimit =
      (handler ? Reflect.getMetadata(`${THROTTLER_LIMIT}auth`, handler) : undefined) ??
      (classRef ? Reflect.getMetadata(`${THROTTLER_LIMIT}auth`, classRef) : undefined);
    const hasRecoveryLimit =
      (handler ? Reflect.getMetadata(`${THROTTLER_LIMIT}recovery`, handler) : undefined) ??
      (classRef ? Reflect.getMetadata(`${THROTTLER_LIMIT}recovery`, classRef) : undefined);

    if (throttler.name === 'auth' && hasAuthLimit === undefined) {
      return true;
    }
    if (throttler.name === 'recovery' && hasRecoveryLimit === undefined) {
      return true;
    }
    if (
      throttler.name === 'default' &&
      (hasAuthLimit !== undefined || hasRecoveryLimit !== undefined)
    ) {
      return true;
    }

    return super.handleRequest(requestProps);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for'];
    const firstForwarded = typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined;
    const clientIp =
      (firstForwarded ? firstForwarded.trim() : undefined) ||
      (req.ip as string | undefined) ||
      (req.connection?.remoteAddress as string | undefined) ||
      '127.0.0.1';

    // If authenticated user is present, track by user ID to isolate rate limits across shared NATs
    const user = req.user as { id?: string } | undefined;
    if (user?.id) {
      return `usr:${user.id}`;
    }
    return `ip:${clientIp}`;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const retryAfter = Math.max(1, Math.ceil(throttlerLimitDetail.timeToExpire));
    res.setHeader('Retry-After', retryAfter.toString());

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Please slow down and try again in ${retryAfter} second(s).`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
