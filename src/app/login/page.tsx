'use client';

// Login (Fase QQ): se eliminó la pestaña "Modo Prueba" con la tabla de cuentas demo —
// era un ítem pendiente pre-lanzamiento (exponía cuentas y contraseñas de prueba a
// cualquier visitante) y además su fetch fallaba con permission-denied en la consola de
// todos los usuarios anónimos. Para probar roles se ingresan las credenciales a mano.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, LogIn } from 'lucide-react';
// ✅ Usamos nuestra instancia 'app' configurada para evitar errores de inicialización
import { app } from '@/lib/firebase';

// A dónde "vive" cada rol — el login siempre empujaba a `/`, que para tienda,
// repartidor y admin es el marketplace de compradores, no su panel (Tanda B).
const roleHome = (role?: string) =>
  role === 'admin' ? '/admin'
  : role === 'store' ? '/my-store'
  : role === 'delivery' ? '/delivery'
  : '/';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const { toast } = useToast();
  const { user, userProfile, loading } = useAuth();

  // Redirección única para TODOS los caminos (Tanda B): si ya estás logueado, /login te
  // manda directo a tu panel (antes mostraba el formulario igual); y tras un login
  // (email o Google), apenas llega el perfil te lleva según tu ROL. Esto también cubre
  // el primer login con Google de una cuenta nueva (el perfil lo crea auth-context).
  useEffect(() => {
    if (!loading && user && userProfile) {
      router.replace(roleHome(userProfile.role));
    }
  }, [loading, user, userProfile, router]);

  // ✅ Login con Email/Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: '¡Sesión Iniciada!', description: 'Serás redirigido en breve.' });
      // La redirección la hace el useEffect de arriba, según el ROL del perfil.
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Inicio de Sesión',
        description: error.code === 'auth/invalid-credential' ? 'Credenciales inválidas.' : error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ Login con Google
  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // La redirección la hace el useEffect de arriba, según el ROL del perfil
        // (para una cuenta Google NUEVA, auth-context crea el perfil de comprador solo).
        toast({ title: "¡Bienvenido!", description: "Sesión iniciada con Google." });
    } catch (error: any) {
        console.error("Error Google:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            toast({ variant: "destructive", title: "Error", description: "No se pudo iniciar con Google." });
        }
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">Bienvenido</CardTitle>
          <CardDescription className="text-center">
            Ingresa a tu cuenta para gestionar pedidos y ventas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button id="login-button" type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              Iniciar Sesión
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">O continúa con</span>
            </div>
          </div>

          {/* Botón de Google */}
          <Button variant="outline" className="w-full relative" onClick={handleGoogleLogin} disabled={isSubmitting}>
            <svg className="mr-2 h-4 w-4 absolute left-4" viewBox="0 0 24 24">
                <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                />
                <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                />
                <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                />
                <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                />
            </svg>
            Google
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta? <Link href="/signup" className="ml-1 text-primary hover:underline">Regístrate</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
