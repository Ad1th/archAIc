export type AuthResponse = {
  access_token: string;
  token_type: string;
  trace_id: string;
};

export type Product = {
  id: string;
  name: string | null;
  price: number;
  stock?: number;
};

export type ProductsResponse = {
  products: Product[];
  trace_id: string;
};

export type CartItemType = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
};

export type CartResponse = {
  user_id: string;
  items: CartItemType[];
  total: number;
  trace_id: string;
};

export type AddToCartResponse = {
  status: string;
  cart: CartItemType[];
  trace_id: string;
};

export type CheckoutResponse = {
  checkout_url: string;
  amount_usd: number;
  session_id: string;
  trace_id: string;
};
