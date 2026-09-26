import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(12).max(128);
export const nameSchema = z.string().trim().min(1).max(80);
export function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid input. Check required fields and length limits.');
  return result.data;
}
