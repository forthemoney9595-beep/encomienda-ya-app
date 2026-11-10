import Link from 'next/link';

export default function TermsPage() {
  return (
    // Texto largo en vidrio (rediseño 9/11/2026): `prose` sobre `glass-strong` (el vidrio más
    // opaco) para que el párrafo se lea parejo sobre la veladura, con títulos en letra de cartel.
    <div className="mx-auto max-w-3xl py-2 md:py-6">
      <article
        data-testid="legal-terms"
        className="glass-strong prose prose-slate max-w-none rounded-card p-5 dark:prose-invert sm:p-10 prose-headings:font-headline prose-headings:tracking-tight prose-h1:text-[2.1rem] prose-h1:leading-tight prose-h2:mt-10 prose-h2:text-2xl prose-a:font-semibold prose-a:text-primary prose-a:underline-offset-4 prose-li:my-1 prose-p:leading-relaxed"
      >
      <h1>Términos y Condiciones de Uso</h1>
      <p className="text-muted-foreground text-sm">Última actualización: noviembre de 2026</p>

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
        <li>Podemos suspender cuentas que incumplan estos términos, siguiendo el procedimiento de la sección 8.</li>
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

      <h2 id="suspension">8. Suspensión de cuentas</h2>
      <p>
        Si una cuenta de repartidor o de tienda incumple estos términos, la administración puede suspenderla. La
        suspensión sigue siempre este procedimiento:
      </p>
      <ul>
        <li>
          <strong>Motivo por escrito.</strong> Te avisamos por la app (notificación y aviso en tu panel) el motivo
          (por ejemplo: documentación vencida o falsa, reclamos reiterados, incidentes graves con pedidos, conducta
          con clientes o comercios, o uso indebido de la cuenta) y un detalle de lo ocurrido.
        </li>
        <li>
          <strong>Duración.</strong> La suspensión puede ser por un plazo fijo (7, 15 o 30 días), que termina
          automáticamente al vencer, o hasta que la administración revise el caso. En el aviso figura hasta cuándo dura.
        </li>
        <li>
          <strong>Qué cambia mientras dura.</strong> Un repartidor no puede tomar pedidos nuevos y una tienda no recibe
          pedidos nuevos. Los pedidos que ya estaban en curso se terminan normalmente. Lo que hayas ganado hasta ese
          momento se te sigue debiendo y podés solicitar su pago.
        </li>
        <li>
          <strong>Derecho a apelar.</strong> Podés apelar una vez por cada suspensión desde tu panel, contando tu versión
          de lo que pasó.
        </li>
        <li>
          <strong>Respuesta por escrito.</strong> La administración revisa la apelación y te responde por escrito: o
          levanta la suspensión, o la mantiene explicando por qué.
        </li>
      </ul>

      <h2>9. Limitación de Responsabilidad</h2>
      <p>
        EncomiendaYA no será responsable por daños indirectos, lucro cesante o pérdida de datos
        derivados del uso de la plataforma.
      </p>

      <h2>10. Modificaciones</h2>
      <p>
        Nos reservamos el derecho de modificar estos términos en cualquier momento.
        Los cambios serán notificados con al menos 7 días de anticipación.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para consultas sobre estos términos, contactanos a través de{' '}
        <Link href="/support" className="text-primary underline">nuestra página de soporte</Link>.
      </p>
      </article>
    </div>
  );
}
