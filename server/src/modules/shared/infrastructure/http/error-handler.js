/**
 * INFRAESTRUCTURA HTTP COMPARTIDA: Manejo uniforme de excepciones de dominio en controladores Express
 */
export function handleModuleControllerError(error, res, next) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.publicMessage || error.message });
  }
  return next(error);
}

