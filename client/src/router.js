export const ADMIN_ROUTES = [
  {
    path: '/admin/dashboard',
    segment: 'dashboard',
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Analítica visual, KPIs e indicadores gráficos del club.'
  },
  {
    path: '/admin/productos',
    segment: 'productos',
    id: 'productos',
    label: 'Productos',
    description: 'Catálogo maestro de hamburguesas, precios, fotografías y visibilidad.'
  },
  {
    path: '/admin/votaciones',
    segment: 'votaciones',
    id: 'votaciones',
    label: 'Ciclos de Votación',
    description: 'Programación de campañas mensuales, apertura de urna y escrutinio en vivo.'
  },
  {
    path: '/admin/usuarios',
    segment: 'usuarios',
    id: 'usuarios',
    label: 'Usuarios',
    description: 'Equipo operativo interno (Administradores y Chefs) con gestión de roles.'
  },
  {
    path: '/admin/clientes',
    segment: 'clientes',
    id: 'clientes',
    label: 'Clientes',
    description: 'Directorio paginado de miembros del club (solo lectura, sin cambio de rol).'
  },
  {
    path: '/admin/trazabilidad',
    segment: 'trazabilidad',
    id: 'trazabilidad',
    label: 'Trazabilidad',
    description: 'Bitácora inmutable y paginada de eventos de auditoría del sistema.'
  }
];

export function normalizePath(rawPath = '/') {
  const clean = (rawPath || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (clean === '/admin') return '/admin/dashboard';
  return clean;
}
