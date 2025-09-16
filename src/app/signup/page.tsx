import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { User, Store, Bike } from "lucide-react";
import PageHeader from "@/components/page-header";

export default function SignupPage() {
  const roles = [
    {
      name: "Comprador",
      description: "Crea una cuenta para pedir de tus tiendas favoritas.",
      icon: <User className="h-12 w-12" />,
      href: "/signup/buyer"
    },
    {
      name: "Tienda",
      description: "Registra tu negocio para empezar a vender tus productos.",
      icon: <Store className="h-12 w-12" />,
      href: "/signup/store"
    },
    {
      name: "Repartidor",
      description: "Únete a nuestro equipo para empezar a entregar pedidos.",
      icon: <Bike className="h-12 w-12" />,
      href: "/signup/delivery"
    }
  ]

  return (
    <div className="container mx-auto">
      <PageHeader title="Únete a EncomiendaYA" description="Elige el tipo de cuenta que quieres crear." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {roles.map((role) => (
          <Link href={role.href} key={role.name}>
            <Card className="h-full transform transition-all hover:-translate-y-2 hover:shadow-xl hover:border-primary">
              <CardHeader className="flex flex-col items-center justify-center text-center p-8">
                <div className="mb-4 text-primary transition-transform group-hover:scale-110">{role.icon}</div>
                <CardTitle className="text-xl">{role.name}</CardTitle>
                <CardDescription className="mt-2">{role.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center text-sm">
        ¿Ya tienes una cuenta?{" "}
        <Link href="/login" className="underline hover:text-primary">
          Iniciar Sesión
        </Link>
      </div>
    </div>
  );
}
