
'use client';

import { useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Bot } from 'lucide-react';

export default function DriverReviewsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simula una carga de datos o inicialización de IA
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Analiza el rendimiento y los comentarios de tu flota de reparto con IA."
      />
      <Card>
        <CardContent className="pt-6">
            {loading ? (
                <div className="space-y-4">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-6 w-1/4 mt-4" />
                    <Skeleton className="h-20 w-full" />
                </div>
            ) : (
                <div className="text-center text-muted-foreground py-10">
                    <Bot className="mx-auto h-12 w-12 mb-4" />
                    <p className="text-lg font-semibold">Análisis con IA en preparación.</p>
                    <p>Esta funcionalidad está siendo implementada para proporcionarte resúmenes inteligentes sobre el rendimiento de tus repartidores.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
