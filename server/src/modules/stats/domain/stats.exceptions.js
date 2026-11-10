import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Stats
 */
export class StatsComputationException extends DomainException {
  constructor(message = 'No se pudieron calcular las estadísticas del dashboard.') {
    super(message, { code: 'STATS_COMPUTATION_ERROR', status: 500 });
  }
}

