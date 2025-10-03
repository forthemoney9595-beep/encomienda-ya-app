

'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, useFirestore } from '@/firebase';
import { getUserProfile } from '@/lib/user';
import { ProfileForm } from './profile-form';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/user';

export default function ProfilePage() {
    const { user: authUser, loading: authLoading } = useAuth();
    const db = useFirestore();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfile() {
            if (authLoading) return;
            if (!authUser) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const userProfile = await getUserProfile(db, authUser.uid);
            setProfile(userProfile);
            setLoading(false);
        }

        fetchProfile();
    }, [authUser, authLoading, db]);

    if (loading || authLoading) {
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

    if (!profile) {
        return (
             <div className="container mx-auto">
                <PageHeader title="Mi Perfil" description="No se pudo cargar el perfil." />
            </div>
        )
    }

    return (
        <div className="container mx-auto">
            <PageHeader title="Mi Perfil" description="Gestiona la información de tu cuenta." />
            <ProfileForm user={profile} />
        </div>
    );
}
