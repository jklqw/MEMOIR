import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiErrorCode, ApiResponse } from '@memoir/shared';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ApiErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        const rawMsg = obj['message'];
        if (Array.isArray(rawMsg)) {
          message = rawMsg.join('; ');
          details = obj['details'] || rawMsg;
        } else {
          message = (rawMsg as string) || exception.message;
          details = obj['details'];
        }
        code = (obj['code'] as ApiErrorCode) || this.mapStatusToCode(status);
      }
    } else if (
      (exception as Record<string, unknown>)?.['type'] === 'entity.too.large' ||
      (exception as Record<string, unknown>)?.['status'] === 413 ||
      (exception as Record<string, unknown>)?.['statusCode'] === 413
    ) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = ApiErrorCode.BAD_REQUEST;
      message = 'Request payload too large.';
    } else if (typeof (exception as Record<string, unknown>)?.['status'] === 'number') {
      status = (exception as Record<string, unknown>)['status'] as number;
      message = ((exception as Record<string, unknown>)['message'] as string) || 'Request error';
      code = this.mapStatusToCode(status);
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled internal error: ${exception.message}`, exception.stack);
      message = 'An internal server error occurred';
    }

    const payload: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };

    response.status(status).json(payload);
  }

  private mapStatusToCode(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.LOCKED:
        return ApiErrorCode.LOCKED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.TOO_MANY_REQUESTS;
      default:
        return ApiErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
