import MercadoPagoConfig from "mercadopago";

// ARQ-014 (auditoría oct 2026): el cliente de MercadoPago se construía en 3 lugares
// (webhook, checkout, conciliación), uno de ellos por request. Un solo singleton perezoso:
// se crea la primera vez que alguien lo pide y falla con un mensaje claro si falta el token.
let client: MercadoPagoConfig | null = null;
export function getMpClient(): MercadoPagoConfig {
  if (client) return client;
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN no definido");
  client = new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
  return client;
}
