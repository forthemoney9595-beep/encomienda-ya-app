'use client';

import { useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, ThumbsUp, ThumbsDown, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Datos de reseñas simuladas para la demostración de IA
const mockReviews = [
  { driver: 'Repartidor Proto', rating: 5, comment: '¡Entrega súper rápida y muy amable! Excelente servicio.' },
  { driver: 'Repartidor Proto', rating: 4, comment: 'Llegó a tiempo, todo bien.' },
  { driver: 'Otro Repartidor', rating: 3, comment: 'Tardó un poco más de lo esperado, pero el pedido estaba correcto.' },
  { driver: 'Repartidor Proto', rating: 5, comment: 'El mejor repartidor, siempre con una sonrisa.' },
  { driver: 'Otro Repartidor', rating: 2, comment: 'No encontraba la dirección y tuve que salir a buscarlo.' },
  { driver: 'Repartidor Proto', rating: 5, comment: 'Impecable, como siempre.' },
];

// Simulación de un análisis de IA
const simulateAiAnalysis = () => {
  const positiveKeywords = ['rápido', 'amable', 'excelente', 'bien', 'sonrisa', 'impecable'];
  const negativeKeywords = ['tardó', 'esperado', 'no encontraba', 'buscarlo'];
  
  let positiveMentions = 0;
  let negativeMentions = 0;

  mockReviews.forEach(review => {
    const commentLower = review.comment.toLowerCase();
    if (positiveKeywords.some(kw => commentLower.includes(kw))) {
      positiveMentions++;
    }
    if (negativeKeywords.some(kw => commentLower.includes(kw))) {
      negativeMentions++;
    }
  });

  return {
    summary: 'El análisis muestra un sentimiento predominantemente positivo. Los repartidores son frecuentemente elogiados por su amabilidad y rapidez. El área principal de mejora es la navegación y la gestión del tiempo en algunas entregas.',
    strengths: [
      'Alta satisfacción con la amabilidad del personal (mencionado en el 45% de las reseñas positivas).',
      'Velocidad de entrega consistentemente valorada positivamente.',
      'Profesionalismo y buen trato al cliente.'
    ],
    weaknesses: [
      'Dificultades ocasionales con la navegación a la dirección de entrega.',
      'Retrasos menores en un 15% de los pedidos analizados.'
    ]
  }
};


export default function DriverReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const result = simulateAiAnalysis();
      setAnalysis(result);
      setLoading(false);
    }, 2500); // Simula el tiempo de procesamiento de la IA
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Analiza el rendimiento y los comentarios de tu flota de reparto con IA."
      />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                Resumen Inteligente
            </CardTitle>
            <Badge variant={loading ? 'outline' : 'secondary'}>{loading ? 'Analizando...' : 'Análisis Completo'}</Badge>
        </CardHeader>
        <CardContent className="pt-2">
            {loading ? (
                <div className="space-y-6">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        <div>
                            <Skeleton className="h-6 w-1/3 mb-3" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-5/6" />
                        </div>
                        <div>
                            <Skeleton className="h-6 w-1/3 mb-3" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <p className="text-muted-foreground">{analysis.summary}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-secondary/30">
                            <CardHeader>
                                <CardTitle className="flex items-center text-lg gap-2 text-green-500">
                                    <TrendingUp className="h-5 w-5" />
                                    Puntos Fuertes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="list-disc pl-5 space-y-2 text-sm">
                                    {analysis.strengths.map((item: string, index: number) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                         <Card className="bg-destructive/10">
                            <CardHeader>
                                <CardTitle className="flex items-center text-lg gap-2 text-destructive">
                                    <TrendingDown className="h-5 w-5" />
                                    Áreas de Mejora
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                               <ul className="list-disc pl-5 space-y-2 text-sm">
                                    {analysis.weaknesses.map((item: string, index: number) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
