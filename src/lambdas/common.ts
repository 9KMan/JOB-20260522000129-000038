import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>, body: string | null | undefined): T {
  if (!body) throw new ValidationError('Request body is required');
  try {
    return schema.parse(JSON.parse(body));
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ValidationError(e.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', '));
    }
    throw new ValidationError('Invalid JSON body');
  }
}

export function validateQuery<T>(schema: ZodSchema<T>, query: Record<string, string> | null | undefined): T {
  if (!query) throw new ValidationError('Query parameters are required');
  try {
    return schema.parse(query);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ValidationError(e.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', '));
    }
    throw new ValidationError('Invalid query parameters');
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function getUserIdFromEvent(event: any): string {
  return event.requestContext.authorizer.claims.sub;
}