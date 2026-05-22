import { ZodSchema, ZodError } from 'zod';

export function parseBody<T>(schema: ZodSchema<T>, body: string | null | undefined): T {
  if (!body) {
    throw new Error('Request body is required');
  }
  const parsed = JSON.parse(body);
  return schema.parse(parsed);
}

export function formatZodError(error: ZodError): string {
  return error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
}