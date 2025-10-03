import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthInstance } from '@/firebase';
import { getUserProfile } from '@/lib/user';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
    const auth = useAuthInstance();
    const firebaseUser = auth.currentUser;

    // In a real app, you might use a server-side session management solution.
    // For this prototype, we'll rely on the auth state which might not be available
    // on the very first server render after login. Client-side auth provider handles this.
    // This server-side fetch is an optimistic enhancement.
    let user = null;
    if (firebaseUser) {
        user = await getUserProfile(firebaseUser.uid);
    }

    if (!user) {
        // This will be shown briefly while the client-side auth context loads
        // and either provides the user or redirects to /login.
        return (
            <div className="container mx-auto">
                <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta." />
                <Card className="w-full max-w-2xl mx-auto">
                    <CardHeader className="flex-row items-center gap-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div>
                            <Skeleton className="h-7 w-40 mb-2" />
                            <Skeleton className="h-5 w-48" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Skeleton className="h-10 w-32" />
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="container mx-auto">
            <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta." />
            <ProfileForm user={user} />
        </div>
    );
}
