/**
 * CAPA DE DOMINIO: Esquemas de Validación de Entradas de Dominio
 */

import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_STATUSES, ROLES } from './entities.js';

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(160)
    .transform(value => value.toLowerCase()),
  password: z.string().min(8).max(72)
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80)
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(10)
});

export const burgerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(500),
  ingredients: z.string().trim().min(3).max(500),
  imageUrl: z.string().trim().min(1).max(2500000).default('/assets/hero-burger.jpeg'),
  priceCop: z.number().int().min(1000).max(500000),
  active: z.boolean().default(true)
});

export const campaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
    burgerIds: z.array(z.number().int().positive()).min(2).max(8)
  })
  .refine(data => Date.parse(data.endsAt) > Date.parse(data.startsAt), {
    message: 'La fecha final debe ser posterior a la inicial.'
  });

export const voteSchema = z.object({
  burgerId: z.number().int().positive(),
  quantity: z
    .number({ invalid_type_error: 'La cantidad debe ser un número entero.' })
    .int('La cantidad debe ser un número entero.')
    .min(1, 'Debes indicar al menos 1 hamburguesa.')
    .max(50, 'El máximo permitido por voto es de 50 hamburguesas.')
    .default(1)
});

export const orderItemSchema = z.object({
  burgerId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10),
  removedIngredients: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  notes: z.string().trim().max(250).default('')
});

export const orderSchema = z.object({
  phone: z.string().trim().min(7).max(30),
  deliveryAddress: z.string().trim().min(8).max(250),
  notes: z.string().trim().max(500).default(''),
  items: z.array(orderItemSchema).min(1).max(20)
});

export const kitchenStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'])
});

export const saleOrderUpdateSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  status: z.enum(ORDER_STATUSES).optional()
});

export const campaignVoteOrderUpdateSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  deliveryAddress: z.string().trim().min(5).max(250).optional(),
  notes: z.string().trim().max(500).optional()
});

export const roleUpdateSchema = z.object({
  role: z.enum(ROLES)
});

