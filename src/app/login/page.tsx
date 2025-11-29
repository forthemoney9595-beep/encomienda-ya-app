'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Lock, Loader2, LogIn } from 'lucide-react';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { UserProfile } from '@/context/auth-context';
// ✅ Usamos nuestra instancia 'app' configurada para evitar errores de inicialización
import { app } from '@/lib/firebase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(true);
  const [demoUsers, setDemoUsers] = useState<any[]>([]);

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Función para obtener los usuarios demo de Firebase y popular la tabla
    const fetchDemoUsers = async () => {
        try {
            const db = getFirestore(app);
            const userIds = ['admin-id', 'store-id', 'delivery-id', 'buyer-id']; // IDs de ejemplo que podrías tener creados manualmente
            const users = [];

            for (const id of userIds) {
                const docRef = doc(db, 'users', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const profile = docSnap.data() as UserProfile;
                    users.push({
                        uid: id,
                        email: profile.email,
                        role: profile.role,
                        password: 'password' // Mock password for display
                    });
                }
            }
            
            if (users.length > 0) {
                setDemoUsers(users);
            } else {
                // Fallback si no existen en BD
                 setDemoUsers(Object.values({
                    'admin-id': { email: 'admin@test.com', password: 'password', role: 'admin' },
                    'store-id': { email: 'tienda@test.com', password: 'password', role: 'store' },
                    'delivery-id': { email: 'repartidor@test.com', password: 'password', role: 'delivery' },
                    'buyer-id': { email: 'comprador@test.com', password: 'password', role: 'buyer' },
                 }));
            }
            
        } catch (error) {
            console.error("Error fetching demo users:", error);
            // Fallback local en caso de error
            setDemoUsers(Object.values({
                'admin-id': { email: 'admin@test.com', password: 'password', role: 'admin' },
                'store-id': { email: 'tienda@test.com', password: 'password', role: 'store' },
                'delivery-id': { email: 'repartidor@test.com', password: 'password', role: 'delivery' },
                'buyer-id': { email: 'comprador@test.com', password: 'password', role: 'buyer' },
             }));
        } finally {
            setIsDemoLoading(false);
        }
    };
    fetchDemoUsers();
  }, []);

  // ✅ Login con Email/Password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: '¡Sesión Iniciada!', description: 'Serás redirigido en breve.' });
      router.push('/');
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
        router.push('/');
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

  const handleDemoLogin = (user: any) => {
    setEmail(user.email);
    setPassword(user.password);
    // Simular clic
    setTimeout(() => {
        document.getElementById('login-button')?.click();
    }, 100);
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
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="demo">Modo Prueba</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6 space-y-4">
              
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
                    {/* ✅ CORREGIDO: className correctamente escrito */}
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

            </TabsContent>

            <TabsContent value="demo" className="mt-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Usa estas cuentas de prueba (contraseña: **password**) para simular roles.
              </p>
              <div className="max-h-64 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isDemoLoading ? (
                        <TableRow>
                            <TableCell colSpan={2} className="text-center py-4">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                            </TableCell>
                        </TableRow>
                    ) : (
                        demoUsers.map((user) => (
                            <TableRow 
                                key={user.uid || user.email} 
                                onClick={() => handleDemoLogin(user)}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                                <TableCell className="font-medium capitalize">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                        user.role === 'store' ? 'bg-blue-100 text-blue-700' :
                                        user.role === 'delivery' ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {user.role}
                                    </span>
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                            </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta? <Link href="/signup" className="ml-1 text-primary hover:underline">Regístrate</Link>
        </CardFooter>
      </Card>
    </div>
  );
}