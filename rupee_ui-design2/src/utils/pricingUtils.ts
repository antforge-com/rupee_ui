export type FeeType = 'FLAT' | 'PERCENTAGE';
export type DiscountType = 'FLAT' | 'PERCENTAGE';

export interface PricingConfig {
  baseAmount: number;     // sessionAmount or baseAmountPerSlot * numberOfSlots
  feeType: FeeType;       // From SystemConfig (e.g., 'PERCENTAGE' or 'FLAT')
  feeValue: number;       // The actual fee value (e.g., 5 for 5% or 100 for ₹100)
  discountType?: DiscountType; 
  discountValue?: number; // The discount amount (if an offerId is applied)
}

/**
 * Calculates the final display price for a booking.
 * Math: Math.max(0, Base Amount + Platform Fee - Discount)
 */
export function calculateDisplayPrice(config: PricingConfig): number {
  const { 
    baseAmount, 
    feeType, 
    feeValue, 
    discountType, 
    discountValue = 0 
  } = config;

  // 1. Calculate the Platform Fee
  let fee = 0;
  if (feeType === 'PERCENTAGE') {
    fee = baseAmount * (feeValue / 100);
  } else if (feeType === 'FLAT') {
    fee = feeValue;
  }

  // 2. Subtotal before discount
  const subtotal = baseAmount + fee;

  // 3. Calculate the Discount
  let discount = 0;
  if (discountType === 'PERCENTAGE') {
    discount = subtotal * (discountValue / 100);
  } else if (discountType === 'FLAT') {
    discount = discountValue;
  }

  // 4. Return the Final Amount (ensuring it never drops below 0)
  return Math.round(Math.max(0, subtotal - discount) * 100) / 100;
}
