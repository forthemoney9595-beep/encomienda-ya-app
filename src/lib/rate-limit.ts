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
    // 🔒 API-034 (auditoría pre-producción): la IP del cliente se toma de
    // `x-vercel-forwarded-for`, que lo setea el edge de Vercel y NO es falsificable por el
    // cliente. Antes se usaba `x-forwarded-for.split(',')[0]` — pero el valor MÁS A LA
    // IZQUIERDA de x-forwarded-for es el que MANDA el cliente, así que rotándolo se evadían
    // todos los topes (crear pedidos, checkout, martillar la API de MP). En Vercel,
    // x-forwarded-for también trae la IP real, pero como ÚLTIMO valor de la cadena (el que
    // agrega el proxy), así que si no está x-vercel-forwarded-for usamos ese último. En dev
    // local (sin proxy de Vercel) cae a x-real-ip / 'unknown'.
    const vercelIp = request.headers.get('x-vercel-forwarded-for');
    if (vercelIp) return vercelIp.split(',')[0].trim();

    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) {
        const parts = fwd.split(',').map(s => s.trim()).filter(Boolean);
        // último valor = el que agrega el proxy de confianza (no el que manda el cliente)
        if (parts.length) return parts[parts.length - 1];
    }
    return request.headers.get('x-real-ip') || 'unknown';
}
