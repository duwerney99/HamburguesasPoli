/**
 * PROYECCIONES DE DOMINIO: Módulo Burgers
 */
export function toBurgerProjection(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients,
    priceCop: Number(row.priceCop ?? row.price_cop ?? 0),
    imageUrl: row.imageUrl ?? row.image_url ?? '',
    active: Boolean(row.active),
    deletedAt: row.deletedAt ?? row.deleted_at ?? null
  };
}

