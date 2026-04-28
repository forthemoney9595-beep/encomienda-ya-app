const requestCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limiter por IP. Límites recomendados:
 * - /api/orders/create: 5 pedidos por minuto por IP
 * - /api/checkout:      5 intentos de pago por minuto por IP
 *
 * En Vercel las funciones serverless pueden correr en instancias separadas,
 * por lo que este límite aplica por instancia. Para producción a escala,
 * reemplazar con Upstash Redis.
 */
export function checkRateLimit(
    ip: string,
    key: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const mapKey = `${key}:${ip}`;
    const entry = requestCounts.get(mapKey);

    if (!entry || now > entry.resetAt) {
        requestCounts.set(mapKey, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1 };
    }

    if (entry.count >= maxRequests) {
        return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
}

export function getClientIp(request: Request): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    );
}
