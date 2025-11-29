'use client';

import { useState } from 'react';
import { sendPasswordResetEmail, getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsLoading(true);
    
    try {
      const auth = getAuth(app);
      // Esto envía un email oficial de Firebase al correo del usuario
      await sendPasswordResetEmail(auth, email);
      
      setIsSent(true);
      toast({ 
        title: "Correo enviado", 
        description: "Revisa tu bandeja de entrada." 
      });
    } catch (error: any) {
      console.error(error);
      let message = "Ocurrió un error al enviar el correo.";
      if (error.code === 'auth/user-not-found') message = "No encontramos ninguna cuenta con este correo.";
      if (error.code === 'auth/invalid-email') message = "El formato del correo no es válido.";
      
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Recuperar Acceso</CardTitle>
          <CardDescription className="text-center">
            Ingresa tu email y te enviaremos un enlace mágico para crear una nueva contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {isSent ? (
            <div className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-lg text-center space-y-3 animate-in fade-in zoom-in duration-300">
                <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">¡Correo Enviado!</h3>
                <p className="text-sm text-muted-foreground">
                    Hemos enviado las instrucciones a <strong>{email}</strong>. 
                    <br/>Revisa tu carpeta de Spam si no lo ves en unos minutos.
                </p>
                <Button variant="outline" className="mt-4 w-full" onClick={() => { setIsSent(false); setEmail(''); }}>
                    Probar con otro correo
                </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                        id="email" 
                        type="email" 
                        placeholder="ejemplo@correo.com" 
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required 
                    />
                </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Enviar Enlace de Recuperación"}
                </Button>
            </form>
          )}

        </CardContent>
        <CardFooter className="flex justify-center border-t pt-4 mt-2">
          <Link href="/login" className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio de sesión
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}