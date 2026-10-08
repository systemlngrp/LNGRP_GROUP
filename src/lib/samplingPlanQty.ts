export const DEFAULT_SAMPLING_PLAN_QTY_DIVISOR = 2000;
export const DEFAULT_SAMPLING_PLAN_QTY_MIN = 2;
export const DEFAULT_SAMPLING_PLAN_QTY_MAX = 4;

export type SamplingPlanSettings = {
  samplingPlanQtyDivisor?: number;
  samplingPlanQtyMin?: number;
  samplingPlanQtyMax?: number;
};

export function getSamplingPlanQtySettings(settings?: SamplingPlanSettings | null) {
  const divisor = Number(settings?.samplingPlanQtyDivisor);
  const minimum = Number(settings?.samplingPlanQtyMin);
  const maximum = Number(settings?.samplingPlanQtyMax);
  const safeDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : DEFAULT_SAMPLING_PLAN_QTY_DIVISOR;
  const safeMinimum = Number.isInteger(minimum) && minimum > 0 ? minimum : DEFAULT_SAMPLING_PLAN_QTY_MIN;
  const safeMaximum = Number.isInteger(maximum) && maximum >= safeMinimum ? maximum : Math.max(DEFAULT_SAMPLING_PLAN_QTY_MAX, safeMinimum);
  return { divisor: safeDivisor, minimum: safeMinimum, maximum: safeMaximum };
}

export function calculateSamplingPlanQty(planQty: unknown, settings?: SamplingPlanSettings | null): number | "" {
  const quantity = Number(planQty);
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  const { divisor, minimum, maximum } = getSamplingPlanQtySettings(settings);
  return Math.min(maximum, Math.max(minimum, Math.ceil(quantity / divisor)));
}
