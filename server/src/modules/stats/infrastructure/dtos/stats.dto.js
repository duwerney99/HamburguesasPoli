import { z } from 'zod';

/**
 * INFRASTRUCTURE DTOs: Esquemas para el Módulo Stats
 */
export const statsFilterDtoSchema = z.object({
  period: z.enum(['ALL', 'CURRENT_CAMPAIGN']).optional().default('ALL')
});

