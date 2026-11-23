import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: User }>();
    const user = request.user;
    if (!user) return null;
    return data ? user[data] : user;
  },
);

export const CurrentSession = createParamDecorator(
  (data: keyof Session | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { session?: Session }>();
    const session = request.session;
    if (!session) return null;
    return data ? session[data] : session;
  },
);
