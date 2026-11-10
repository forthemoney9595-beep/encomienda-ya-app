'use client';

// Login (Fase QQ): se eliminó la pestaña "Modo Prueba" con la tabla de cuentas demo —
// era un ítem pendiente pre-lanzamiento (exponía cuentas y contraseñas de prueba a
// cualquier visitante) y además su fetch fallaba con permission-denied en la consola de
// todos los usuarios anónimos. Para probar roles se ingresan las credenciales a mano.

import { useState, useEffect } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, browserPopupRedirectResolver } from 'firebase/auth';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthScreen, AuthDivider, GoogleButton, authButton } from '@/components/auth-screen';
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
  // Error visible junto a los campos (además del toast, que se va solo y no lo lee un lector de pantalla).
  const [loginError, setLoginError] = useState<string | null>(null);
  const hydrated = useHydrated();

  const router = useRouter();
  const { toast } = useToast();
  const { user, userProfile, loading } = useAuth();
  // ARQ-004 / CY-002: /login?expired=1&next=/ruta — llega acá authed-fetch (sesión vencida o
  // cuenta deshabilitada). Se lee de window.location en vez de useSearchParams para no
  // exigir el Suspense de Next 14 en esta página.
  const [expired, setExpired] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setExpired(sp.get('expired') === '1');
    const n = sp.get('next');
    if (n && n.startsWith('/') && !n.startsWith('//')) setNextPath(n);
  }, []);

  // Redirección única para TODOS los caminos (Tanda B): si ya estás logueado, /login te
  // manda directo a tu panel (antes mostraba el formulario igual); y tras un login
  // (email o Google), apenas llega el perfil te lleva según tu ROL. Esto también cubre
  // el primer login con Google de una cuenta nueva (el perfil lo crea auth-context).
  useEffect(() => {
    if (!loading && user && userProfile) {
      router.replace(nextPath || roleHome(userProfile.role));
    }
  }, [loading, user, userProfile, router, nextPath]);

  // ✅ Login con Email/Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: '¡Sesión Iniciada!', description: 'Serás redirigido en breve.' });
      // La redirección la hace el useEffect de arriba, según el ROL del perfil.
    } catch (error: any) {
      setLoginError(error.code === 'auth/invalid-credential' ? 'El correo o la contraseña no coinciden. Revisalos y probá de nuevo.' : error.code === 'auth/too-many-requests' ? 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.' : 'No pudimos iniciar sesión. Probá de nuevo.');
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
        await signInWithPopup(auth, provider, browserPopupRedirectResolver); // PERF-012: Auth se inicializa sin el resolver; se pasa solo acá
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
    <AuthScreen
      testId="login-card"
      title="Entrá a tu cuenta"
      description="Para pedir, vender o repartir en Tinogasta."
      footer={
        <p>
          ¿Todavía no tenés cuenta?{' '}
          <Link href="/signup" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            Registrate
          </Link>
        </p>
      }
    >
      {expired && (
        <div role="status" className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Tu sesión venció o se cerró. Volvé a iniciar sesión para continuar.
        </div>
      )}
      <form onSubmit={handleLogin} method="post" action="#" className="space-y-4">
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
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
              className="!pl-12"
              required
              disabled={isSubmitting}
              aria-invalid={!!loginError}
              aria-describedby={loginError ? 'login-error' : undefined}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              ¿Te la olvidaste?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
              className="!pl-12"
              required
              disabled={isSubmitting}
              aria-invalid={!!loginError}
              aria-describedby={loginError ? 'login-error' : undefined}
            />
          </div>
        </div>

        {loginError && (
          <p id="login-error" role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {loginError}
          </p>
        )}

        <Button id="login-button" type="submit" className={authButton} disabled={!hydrated || isSubmitting}>
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          Iniciar sesión
        </Button>
      </form>

      <AuthDivider />

      <GoogleButton onClick={handleGoogleLogin} disabled={isSubmitting} />
    </AuthScreen>
  );
}
