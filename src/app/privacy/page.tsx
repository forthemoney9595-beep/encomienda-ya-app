import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 prose prose-slate">
      <h1>Política de Privacidad</h1>
      <p className="text-muted-foreground text-sm">Última actualización: abril de 2025</p>

      <h2>1. Responsable del Tratamiento</h2>
      <p>
        EncomiendaYA es responsable del tratamiento de tus datos personales conforme a la
        Ley N° 25.326 de Protección de Datos Personales de la República Argentina.
      </p>

      <h2>2. Datos que Recopilamos</h2>
      <ul>
        <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y contraseña (encriptada).</li>
        <li><strong>Datos de entrega:</strong> dirección y coordenadas GPS, únicamente para completar el pedido.</li>
        <li><strong>Datos de contacto:</strong> número de teléfono, para que el repartidor pueda comunicarse.</li>
        <li><strong>Datos de pago:</strong> no almacenamos datos de tarjetas. Los pagos son procesados por MercadoPago.</li>
        <li><strong>Datos de uso:</strong> historial de pedidos y favoritos para mejorar tu experiencia.</li>
      </ul>

      <h2>3. Finalidad del Tratamiento</h2>
      <ul>
        <li>Procesar y gestionar tus pedidos.</li>
        <li>Enviar notificaciones sobre el estado de tus pedidos.</li>
        <li>Mejorar el funcionamiento de la plataforma.</li>
        <li>Cumplir obligaciones legales y prevenir fraudes.</li>
      </ul>

      <h2>4. Compartición de Datos</h2>
      <p>
        Compartimos tus datos únicamente con:
      </p>
      <ul>
        <li><strong>Tiendas:</strong> tu nombre, dirección de entrega y teléfono para procesar el pedido.</li>
        <li><strong>Repartidores:</strong> tu nombre, dirección y teléfono para realizar la entrega.</li>
        <li><strong>MercadoPago:</strong> correo electrónico para procesar el pago.</li>
        <li><strong>Google Firebase:</strong> plataforma tecnológica donde almacenamos los datos de forma segura.</li>
      </ul>
      <p>No vendemos ni cedemos tus datos a terceros con fines comerciales.</p>

      <h2>5. Ubicación GPS</h2>
      <p>
        La ubicación GPS se solicita únicamente durante el checkout para indicar el punto de entrega
        y durante el seguimiento activo del pedido. No rastreamos tu ubicación de forma continua.
      </p>

      <h2>6. Retención de Datos</h2>
      <p>
        Conservamos tus datos mientras tengas una cuenta activa. Podés solicitar la eliminación
        de tu cuenta y datos en cualquier momento contactándonos.
      </p>

      <h2>7. Tus Derechos</h2>
      <p>
        Conforme a la Ley 25.326, tenés derecho a:
      </p>
      <ul>
        <li>Acceder a tus datos personales.</li>
        <li>Rectificar datos incorrectos.</li>
        <li>Solicitar la eliminación de tus datos ("derecho al olvido").</li>
        <li>Oponerte al tratamiento de tus datos.</li>
      </ul>
      <p>
        Para ejercer estos derechos, contactanos a través de{' '}
        <Link href="/support" className="text-primary underline">nuestra página de soporte</Link>.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Implementamos medidas técnicas y organizativas para proteger tus datos: autenticación segura,
        reglas de acceso en base de datos, y comunicaciones encriptadas (HTTPS).
      </p>

      <h2>9. Cookies</h2>
      <p>
        Utilizamos cookies de sesión estrictamente necesarias para el funcionamiento de la plataforma.
        No utilizamos cookies de rastreo publicitario de terceros.
      </p>

      <h2>10. Contacto</h2>
      <p>
        Ante cualquier consulta sobre esta política, contactanos en{' '}
        <Link href="/support" className="text-primary underline">nuestra página de soporte</Link>.
      </p>
    </div>
  );
}
