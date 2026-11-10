'use client';

import { useState } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';
import { sendPasswordResetEmail, getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthScreen, authButton } from '@/components/auth-screen';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const hydrated = useHydrated();
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  // Error junto al campo además del toast (el toast se va solo y no siempre se lee).
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      
      setErrorMsg(message);
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScreen
      testId="forgot-card"
      title="Recuperá tu acceso"
      description="Escribí el correo de tu cuenta y te mandamos un enlace para crear una contraseña nueva."
      footer={
        <Link href="/login" className="inline-flex min-h-11 items-center gap-2 font-semibold text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Volver a iniciar sesión
        </Link>
      }
    >
      {isSent ? (
        <div
          role="status"
          className="space-y-3 rounded-2xl border border-success/30 bg-success/10 p-5 text-center animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success text-success-foreground">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="font-headline text-2xl font-bold text-foreground">Te mandamos el correo</h2>
          <p className="text-base text-muted-foreground">
            Lo enviamos a <strong className="break-all text-foreground">{email}</strong>. Si en unos minutos no lo ves, revisá la carpeta de spam.
          </p>
          <Button variant="outline" className={authButton + ' bg-background/60'} onClick={() => { setIsSent(false); setEmail(''); }}>
            Probar con otro correo
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} method="post" action="#" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="ejemplo@correo.com"
                className="!pl-12"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                required
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'forgot-error' : undefined}
              />
            </div>
          </div>
          {errorMsg && (
            <p id="forgot-error" role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button type="submit" className={authButton} disabled={!hydrated || isLoading}>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Enviar el enlace
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
