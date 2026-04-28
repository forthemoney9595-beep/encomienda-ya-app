import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 prose prose-slate">
      <h1>Términos y Condiciones de Uso</h1>
      <p className="text-muted-foreground text-sm">Última actualización: abril de 2025</p>

      <h2>1. Aceptación de los Términos</h2>
      <p>
        Al registrarte o utilizar EncomiendaYA, aceptás estos Términos y Condiciones en su totalidad.
        Si no estás de acuerdo, no podés usar la plataforma.
      </p>

      <h2>2. Descripción del Servicio</h2>
      <p>
        EncomiendaYA es una plataforma de comercio electrónico local que conecta tiendas de Tinogasta (Catamarca, Argentina)
        con compradores y repartidores independientes. No somos responsables por los productos vendidos por las tiendas,
        actuamos como intermediarios tecnológicos.
      </p>

      <h2>3. Registro y Cuentas</h2>
      <ul>
        <li>Debés tener al menos 18 años para registrarte.</li>
        <li>La información proporcionada al registrarte debe ser veraz y actualizada.</li>
        <li>Sos responsable de mantener la confidencialidad de tu contraseña.</li>
        <li>Podemos suspender o cancelar cuentas que incumplan estos términos.</li>
      </ul>

      <h2>4. Pedidos y Pagos</h2>
      <ul>
        <li>Los precios son en Pesos Argentinos (ARS) e incluyen los impuestos aplicables.</li>
        <li>El cobro del envío es fijo y se muestra antes de confirmar el pedido.</li>
        <li>Los pagos se procesan a través de MercadoPago. Al pagar, aceptás también los <a href="https://www.mercadopago.com.ar/ayuda/terminos-y-politicas_194" target="_blank" rel="noopener noreferrer">Términos de MercadoPago</a>.</li>
        <li>La tienda puede rechazar un pedido si no tiene stock disponible. En ese caso, el pago es devuelto íntegramente.</li>
      </ul>

      <h2>5. Cancelaciones y Devoluciones</h2>
      <ul>
        <li>El comprador puede cancelar un pedido antes de que sea aceptado por la tienda o antes de realizar el pago.</li>
        <li>Una vez pagado y en preparación, la cancelación queda a criterio de la tienda.</li>
        <li>Las devoluciones por productos defectuosos o incorrectos deben gestionarse directamente con la tienda dentro de las 24 horas de recibido el pedido.</li>
      </ul>

      <h2>6. Responsabilidad de las Tiendas</h2>
      <p>
        Cada tienda es responsable de la calidad, descripción y disponibilidad de sus productos.
        EncomiendaYA no garantiza la exactitud de la información publicada por las tiendas.
      </p>

      <h2>7. Responsabilidad de los Repartidores</h2>
      <p>
        Los repartidores son trabajadores independientes. EncomiendaYA no es empleador de los repartidores
        y no se responsabiliza por daños, demoras o pérdidas ocasionadas durante el transporte.
      </p>

      <h2>8. Limitación de Responsabilidad</h2>
      <p>
        EncomiendaYA no será responsable por daños indirectos, lucro cesante o pérdida de datos
        derivados del uso de la plataforma.
      </p>

      <h2>9. Modificaciones</h2>
      <p>
        Nos reservamos el derecho de modificar estos términos en cualquier momento.
        Los cambios serán notificados con al menos 7 días de anticipación.
      </p>

      <h2>10. Contacto</h2>
      <p>
        Para consultas sobre estos términos, contactanos a través de{' '}
        <Link href="/support" className="text-primary underline">nuestra página de soporte</Link>.
      </p>
    </div>
  );
}
