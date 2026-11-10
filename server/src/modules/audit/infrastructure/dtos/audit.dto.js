import { z } from 'zod';

/**
 * INFRASTRUCTURE DTOs: Esquemas de validación para el Módulo Audit
 */
export const auditQueryDtoSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  q: z.string().optional().default(''),
  entityType: z.string().optional().default('ALL'),
  sortBy: z.string().optional().default('id'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc')
});

