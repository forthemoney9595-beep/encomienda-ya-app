import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Link from "next/link";

export default function SignupDeliveryPage() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Conviértete en Repartidor</CardTitle>
          <CardDescription>
            Regístrate para empezar a ganar dinero haciendo entregas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
           <div className="grid gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" type="text" placeholder="Tu Nombre" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" type="email" placeholder="nombre@ejemplo.com" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required />
          </div>
           <div className="grid gap-2">
            <Label>Tipo de Vehículo</Label>
            <RadioGroup defaultValue="motocicleta" className="flex gap-4 pt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="motocicleta" id="r1" />
                <Label htmlFor="r1">Motocicleta</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="automovil" id="r2" />
                <Label htmlFor="r2">Automóvil</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bicicleta" id="r3" />
                <Label htmlFor="r3">Bicicleta</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button className="w-full">Crear Cuenta de Repartidor</Button>
           <div className="mt-4 text-center text-sm">
            ¿Ya tienes una cuenta?{" "}
            <Link href="/login" className="underline">
              Iniciar Sesión
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
