"use client";

import {
  AddToCartResponse,
  AuthResponse,
  CartResponse,
  CheckoutResponse,
  ProductsResponse,
} from "@/app/microservice-fe/lib/types";

const tokenKey = "archaic-storefront-token";

export class StorefrontError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(tokenKey);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options: RequestInit = {}, requiresAuth = false): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (requiresAuth) {
    const token = getStoredToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const payload = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null;

  if (!response.ok) {
    throw new StorefrontError(payload?.detail ?? payload?.error ?? "Request failed", response.status);
  }

  return payload as T;
}

export function login(email: string, password: string) {
  return request<AuthResponse>(
    "/api/storefront/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    false,
  );
}

export function signup(email: string, password: string) {
  return request<AuthResponse>(
    "/api/storefront/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    false,
  );
}

export function getProducts() {
  return request<ProductsResponse>("/api/storefront/products", { method: "GET" }, true);
}

export function getCart() {
  return request<CartResponse>("/api/storefront/cart", { method: "GET" }, true);
}

export function addToCart(productId: string, quantity = 1) {
  return request<AddToCartResponse>(
    "/api/storefront/cart/add",
    {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    },
    true,
  );
}

export function createCheckout() {
  return request<CheckoutResponse>(
    "/api/storefront/checkout",
    {
      method: "POST",
    },
    true,
  );
}
