import { SALES_MODULE_PORT_INTERFACES } from './sale.interfaces.js';

/**
 * REPOSITORY PORT: Validación de dependencias de puertos para el Módulo Sales
 */
export function assertSalesRepositoryDependencies(repositories) {
  for (const portName of SALES_MODULE_PORT_INTERFACES) {
    if (!repositories || !repositories[portName]) {
      throw new Error(`SalesModule requiere el puerto de repositorio: ${portName}`);
    }
  }
  return repositories;
}

