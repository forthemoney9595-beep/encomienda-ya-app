'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
// ✅ CORRECCIÓN: Importación de Link agregada
import Link from 'next/link'; 
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Lock, Loader2, LogIn } from 'lucide-react';
import { getApp } from 'firebase/app';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { UserProfile } from '@/context/auth-context';

// Lista de usuarios prototipo para desarrollo
const prototypeUsers: Record<string, { email: string; password: string; role: string; }> = {
    // Los datos reales de usuarios se cargan desde la base de datos
    // Estos son solo para mostrar una tabla de referencia en el login
};

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
            const app = getApp();
            const db = getFirestore(app);
            const userIds = ['admin-id', 'store-id', 'delivery-id', 'buyer-id']; // IDs de ejemplo
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
            // Usamos los usuarios reales de la base de datos si existen, si no, usamos un fallback
            if (users.length > 0) {
                setDemoUsers(users);
            } else {
                 setDemoUsers(Object.values({
                    'admin-id': { email: 'admin@test.com', password: 'password', role: 'admin' },
                    'store-id': { email: 'tienda@test.com', password: 'password', role: 'store' },
                    'delivery-id': { email: 'repartidor@test.com', password: 'password', role: 'delivery' },
                    'buyer-id': { email: 'comprador@test.com', password: 'password', role: 'buyer' },
                 }));
            }
            
        } catch (error) {
            console.error("Error fetching demo users:", error);
            // Fallback a usuarios prototipo locales si hay error
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const auth = getAuth(getApp());
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: '¡Sesión Iniciada!', description: 'Serás redirigido en breve.' });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Inicio de Sesión',
        description: error.code === 'auth/invalid-credential' ? 'Credenciales inválidas. Intenta de nuevo.' : error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = (user: any) => {
    setEmail(user.email);
    setPassword(user.password);
    // Simular clic en el botón de login si el usuario hace clic en la fila
    document.getElementById('login-button')?.click();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Iniciar Sesión en EncomiendaYA</CardTitle>
          <CardDescription>
            Usa tu email y contraseña. ¿Aún no tienes cuenta? <Link href="/signup" className="text-primary hover:underline">Regístrate aquí</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="demo">Usuarios de Prueba</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="email" 
                      placeholder="Email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="password" 
                      placeholder="Contraseña" 
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
                  Ingresar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="demo" className="mt-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Usa estas cuentas de prueba (contraseña: **password** en todas) para simular los diferentes roles de la aplicación.
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
                                key={user.uid} 
                                onClick={() => handleDemoLogin(user)}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                                <TableCell className="font-medium capitalize">{user.role}</TableCell>
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
        <CardFooter className="text-xs text-center text-muted-foreground">
          Recuerda que esta es una aplicación de prototipo. Los datos son simulados.
        </CardFooter>
      </Card>
    </div>
  );
}