/**
 * VALUE OBJECT: Participación Porcentual (0.0% - 100.0%)
 */
export class PercentageShareValueObject {
  constructor(part, total) {
    const numPart = Number(part || 0);
    const numTotal = Number(total || 0);
    this.value = numTotal > 0 ? Number(((numPart / numTotal) * 100).toFixed(1)) : 0;
  }

  toNumber() {
    return this.value;
  }
}

