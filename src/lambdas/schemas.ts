import { z } from 'zod';

export const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  name: z.string().min(1).max(100),
});

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export const CreateDataSchema = z.object({
  type: z.string().min(1).max(50),
  payload: z.record(z.unknown()),
});

export const UpdateDataSchema = z.object({
  type: z.string().min(1).max(50).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const PresignQuerySchema = z.object({
  operation: z.enum(['get', 'put']),
  key: z.string().min(1).max(1024),
});