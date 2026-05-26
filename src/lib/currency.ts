// Spotly — money + vouchers. A place can sell prepaid vouchers ("pay 10 KD, get
// 15 KD balance on a card you redeem at the venue"). Currency is set per place
// by the merchant (defaults to the local currency). Kept dependency-free so both
// places.ts and merchant.tsx can import the types without a cycle.

export type Currency = { code: string; symbol: string };

// A single voucher a place offers. `price` is what the customer pays; `value`
// is the balance/credit they receive on the redeemed card (usually >= price).
export type Voucher = {
  id: string;
  price: number;
  value: number;
  label?: string; // optional name, e.g. "Arcade card", "Soft-play pass"
  active?: boolean; // hidden from customers when false
};

export const CURRENCIES: Record<string, Currency> = {
  KWD: { code: 'KWD', symbol: 'KD' },
  SAR: { code: 'SAR', symbol: 'SAR' },
  AED: { code: 'AED', symbol: 'AED' },
  QAR: { code: 'QAR', symbol: 'QAR' },
  BHD: { code: 'BHD', symbol: 'BD' },
  OMR: { code: 'OMR', symbol: 'OMR' },
  USD: { code: 'USD', symbol: '$' },
  EUR: { code: 'EUR', symbol: '€' },
  GBP: { code: 'GBP', symbol: '£' },
};

export const DEFAULT_CURRENCY: Currency = CURRENCIES.KWD;

// Currencies whose minor unit is 1/1000 (3 decimals) rather than 1/100.
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR']);

export function currencyFor(code?: string | null): Currency {
  if (!code) return DEFAULT_CURRENCY;
  const c = code.toUpperCase();
  return CURRENCIES[c] || { code: c, symbol: c };
}

// "10 KD", "$10", "€12.50". Symbol leads for Western currencies, trails for the
// Gulf abbreviations. Drops trailing .00 for whole amounts.
export function formatMoney(amount: number, c?: Currency | string | null): string {
  const cur = typeof c === 'string' ? currencyFor(c) : c || DEFAULT_CURRENCY;
  let n: string;
  if (Number.isInteger(amount)) n = String(amount);
  else n = amount.toFixed(THREE_DECIMAL.has(cur.code) ? 3 : 2);
  const symbolBefore = ['$', '€', '£'].includes(cur.symbol);
  return symbolBefore ? `${cur.symbol}${n}` : `${n} ${cur.symbol}`;
}
