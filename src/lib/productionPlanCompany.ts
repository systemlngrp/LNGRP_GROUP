import { Company, Order, OrderSchedule, Production } from "../types";

type CompanySource = Partial<Production> & Partial<Order> & Partial<OrderSchedule> & {
  companyName?: string;
};

const text = (value: unknown) => String(value ?? "").trim();

export function resolveProductionPlanCompany(
  production: Production,
  schedule: OrderSchedule | undefined,
  order: Order | undefined,
  companies: Company[],
) {
  const company = order?.companyId
    ? companies.find((entry) => String(entry.id) === String(order.companyId))
    : undefined;
  const sources: CompanySource[] = [
    { companyName: company?.name },
    production,
    schedule || {},
    order || {},
  ];
  const name = sources
    .map((source) => text(source.companyName))
    .find(Boolean)
    || text(production.firmName)
    || text(schedule?.firmName)
    || text(order?.firmName)
    || "-";

  return { name, companyId: text(order?.companyId) };
}
