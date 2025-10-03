

'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { getUserProfile } from '@/lib/user';
import { ProfileForm } from './profile-form';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/user';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
    const { user: authUser, loading: authLoading } = useAuth();
    const { updateUser, loading: prototypeLoading } = usePrototypeData();
    const router = useRouter();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || prototypeLoading) return;
        
        if (!authUser) {
            router.push('/login');
            return;
        }

        // In prototype mode, authUser from context is the source of truth
        setProfile(authUser);
        setLoading(false);

    }, [authUser, authLoading, prototypeLoading, router]);

    const handleProfileUpdate = (updatedProfileData: Partial<UserProfile>) => {
        if (!profile) return;
        // The updateUser function from the context will handle the state update and session storage.
        updateUser(updatedProfileData);
    };

    if (loading || authLoading || prototypeLoading || !profile) {
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
            <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta y direcciones." />
            <ProfileForm user={profile} onSave={handleProfileUpdate} />
        </div>
    );
}

    