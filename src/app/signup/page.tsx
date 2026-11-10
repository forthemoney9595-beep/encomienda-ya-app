import Link from "next/link";
import { User, Store, Bike } from "lucide-react";
import { AuthScreen, AuthChoice } from "@/components/auth-screen";

// Elegir el tipo de cuenta (rediseño en vidrio, 9/11/2026): tres filas grandes en vez de tres
// tarjetas que en celular quedaban apiladas con el texto chico. El cliente va primero: es el
// 95 % de quien llega acá.
const roles = [
  {
    name: "Cliente",
    description: "Pedí a las tiendas de Tinogasta y recibí en tu puerta.",
    icon: <User />,
    href: "/signup/buyer",
    testId: "signup-choice-buyer",
  },
  {
    name: "Tienda",
    description: "Vendé tus productos. Un administrador revisa y aprueba tu negocio.",
    icon: <Store />,
    href: "/signup/store",
    testId: "signup-choice-store",
  },
  {
    name: "Repartidor",
    description: "Ganá plata llevando pedidos. Verificamos tus documentos antes de empezar.",
    icon: <Bike />,
    href: "/signup/delivery",
    testId: "signup-choice-delivery",
  },
];

export default function SignupPage() {
  return (
    <AuthScreen
      testId="signup-choice"
      title="Sumate a EncomiendaYA"
      description="¿Qué tipo de cuenta querés crear?"
      footer={
        <p>
          ¿Ya tenés una cuenta?{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            Iniciá sesión
          </Link>
        </p>
      }
    >
      <div className="space-y-3">
        {roles.map((role) => (
          <AuthChoice key={role.name} href={role.href} icon={role.icon} title={role.name} description={role.description} testId={role.testId} />
        ))}
      </div>
    </AuthScreen>
  );
}
