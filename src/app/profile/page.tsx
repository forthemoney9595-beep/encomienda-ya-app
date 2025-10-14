
'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, useFirestore } from '@/firebase';
import { ProfileForm } from './profile-form';
import { useEffect } from 'react';
import type { UserProfile } from '@/lib/user';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { updateUserProfile } from '@/lib/user-service';

export default function ProfilePage() {
    const { user, userProfile, loading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    const handleProfileUpdate = (updatedProfileData: Partial<UserProfile>) => {
        if (!user || !firestore) return;
        updateUserProfile(firestore, user.uid, updatedProfileData);
    };

    if (loading || !userProfile) {
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
            <ProfileForm user={userProfile} onSave={handleProfileUpdate} />
        </div>
    );
}
