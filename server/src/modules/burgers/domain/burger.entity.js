import { PriceCopValueObject } from './price-cop.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Hamburguesa (Módulo Burgers)
 */
export class BurgerEntity {
  constructor({ id, name, description, ingredients, priceCop, imageUrl, active = true, deletedAt = null }) {
    this.id = id;
    this.name = String(name || '').trim();
    this.description = String(description || '').trim();
    this.ingredients = String(ingredients || '').trim();
    this.priceCopVO = new PriceCopValueObject(priceCop ?? 28000);
    this.priceCop = this.priceCopVO.toNumber();
    this.imageUrl = String(imageUrl || '').trim();
    this.active = Boolean(active);
    this.deletedAt = deletedAt;
  }

  isAvailableForPublicCatalog() {
    return this.active && !this.deletedAt;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ingredients: this.ingredients,
      priceCop: this.priceCop,
      imageUrl: this.imageUrl,
      active: this.active,
      deletedAt: this.deletedAt
    };
  }
}

