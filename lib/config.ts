import { FailureType, ServiceId } from "@/lib/types";

export const services = [
  {
    id: "auth",
    name: "Auth",
    systemName: "auth-service",
    url: process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:8001",
    failureTypes: ["timeout", "error", "cpu", "crash"] as FailureType[],
  },
  {
    id: "db",
    name: "DB",
    systemName: "db-service",
    url: process.env.DB_SERVICE_URL ?? "http://127.0.0.1:8002",
    failureTypes: ["timeout", "error", "cpu", "crash", "bad_data"] as FailureType[],
  },
  {
    id: "product",
    name: "Product",
    systemName: "product-service",
    url: process.env.PRODUCT_SERVICE_URL ?? "http://127.0.0.1:8003",
    failureTypes: ["timeout", "error", "cpu", "crash"] as FailureType[],
  },
  {
    id: "payment",
    name: "Payment",
    systemName: "payment-service",
    url: process.env.PAYMENT_SERVICE_URL ?? "http://127.0.0.1:8004",
    failureTypes: ["timeout", "error", "cpu", "crash"] as FailureType[],
  },
] as const;

export function getServiceConfig(id: ServiceId) {
  return services.find((service) => service.id === id);
}
