import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";

export default function SignupStorePage() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Registrar tu Tienda</CardTitle>
          <CardDescription>
            Rellena los datos para registrar tu negocio en la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
           <div className="grid gap-2">
            <Label htmlFor="store-name">Nombre de la Tienda</Label>
            <Input id="store-name" type="text" placeholder="Ej. Paraíso de la Pizza" required />
          </div>
           <div className="grid gap-2">
            <Label htmlFor="category">Categoría</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="italiana">Italiana</SelectItem>
                <SelectItem value="comida-rapida">Comida Rápida</SelectItem>
                <SelectItem value="japonesa">Japonesa</SelectItem>
                <SelectItem value="mexicana">Mexicana</SelectItem>
                <SelectItem value="saludable">Saludable</SelectItem>
                <SelectItem value="dulces">Dulces</SelectItem>
              </SelectContent>
            </Select>
          </div>
           <div className="grid gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" type="text" placeholder="Ej. Calle Pizza 123" required />
          </div>
          <hr className="my-2" />
           <div className="grid gap-2">
            <Label htmlFor="owner-name">Tu Nombre</Label>
            <Input id="owner-name" type="text" placeholder="Tu Nombre" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Correo Electrónico de la Cuenta</Label>
            <Input id="email" type="email" placeholder="nombre@ejemplo.com" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button className="w-full">Registrar Tienda</Button>
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
