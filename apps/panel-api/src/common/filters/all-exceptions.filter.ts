import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter that produces a consistent JSON error envelope and
 * maps Prisma errors to sensible HTTP statuses. GraphQL errors are re-thrown so
 * Apollo formats them.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Let Apollo handle GraphQL-context errors.
    if (host.getType<'graphql'>() === 'graphql') {
      throw exception;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();

    const { status, message, code } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body = {
      statusCode: status,
      error: code,
      message,
      path: request?.url,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private normalize(exception: unknown): {
    status: number;
    message: string | string[];
    code: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as any).message ?? exception.message);
      return {
        status: exception.getStatus(),
        message,
        code: (res as any)?.error ?? exception.name,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: `Unique constraint violation on ${String(
              (exception.meta as any)?.target,
            )}`,
            code: 'CONFLICT',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            message: 'Record not found',
            code: 'NOT_FOUND',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: 'Foreign key constraint failed',
            code: 'BAD_REQUEST',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            message: `Database error ${exception.code}`,
            code: 'DB_ERROR',
          };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid database query',
        code: 'DB_VALIDATION',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}
