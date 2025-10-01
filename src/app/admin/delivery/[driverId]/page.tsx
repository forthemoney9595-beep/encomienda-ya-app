
import { notFound } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getDeliveryPersonById } from '@/lib/data-service';
import { Car, Mail, Phone, ThumbsUp, ThumbsDown, Meh } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getPlaceholderImage } from '@/lib/placeholder-images';

function getStatusVariant(status: string) {
    switch (status) {
        case 'Activo': return 'secondary';
        case 'Pendiente': return 'default';
        case 'Inactivo':
        case 'Rechazado': return 'destructive';
        default: return 'outline';
    }
}

export default async function DriverProfilePage({ params }: { params: { driverId: string } }) {
    const driver = await getDeliveryPersonById(params.driverId);

    if (!driver) {
        notFound();
    }

    // const reviews = await getDriverReviews(params.driverId);

    return (
        <div className="container mx-auto">
            <PageHeader title={`Perfil de ${driver.name}`} description="Ver detalles y el historial de reseñas del conductor." />

            <div className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader className="items-center text-center">
                            <Avatar className="h-24 w-24 mb-4 border-2 border-primary">
                                <AvatarImage src={getPlaceholderImage(driver.id, 128, 128)} alt={driver.name} />
                                <AvatarFallback className="text-3xl">{driver.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <CardTitle className="text-2xl">{driver.name}</CardTitle>
                            <Badge variant={getStatusVariant(driver.status)} className="mt-1">{driver.status}</Badge>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{driver.email}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>(123) 456-7890 (simulado)</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Car className="h-4 w-4 text-muted-foreground" />
                                <span className="capitalize">{driver.vehicle}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Reseñas Analizadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center text-muted-foreground py-10">
                                <p>La funcionalidad de análisis de reseñas con IA ha sido desactivada temporalmente.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
