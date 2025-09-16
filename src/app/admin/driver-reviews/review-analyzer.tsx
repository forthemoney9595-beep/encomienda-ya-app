'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { analyzeDriverReviews, AnalyzeDriverReviewsOutput } from '@/ai/flows/analyze-driver-reviews';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deliveryPersonnel } from '@/lib/placeholder-data';
import { Loader2, Wand2, ThumbsUp, ThumbsDown, Meh } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  driverName: z.string().min(1, 'Por favor selecciona un conductor.'),
  reviewText: z.string().min(10, 'La reseña debe tener al menos 10 caracteres.'),
});

export function ReviewAnalyzer() {
  const [analysis, setAnalysis] = useState<AnalyzeDriverReviewsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      driverName: '',
      reviewText: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeDriverReviews(values);
      setAnalysis(result);
    } catch (error) {
      console.error("Error al analizar la reseña:", error);
      toast({
        variant: "destructive",
        title: "Análisis Fallido",
        description: "Hubo un error al procesar la reseña. Por favor, inténtalo de nuevo.",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
    switch (sentiment.toLowerCase()) {
      case 'positivo':
        return <ThumbsUp className="h-6 w-6 text-green-500" />;
      case 'negativo':
        return <ThumbsDown className="h-6 w-6 text-red-500" />;
      default:
        return <Meh className="h-6 w-6 text-yellow-500" />;
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Enviar una Reseña</CardTitle>
          <CardDescription>Ingresa la reseña de un cliente sobre un conductor para analizarla.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conductor</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un conductor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {deliveryPersonnel.map((driver) => (
                          <SelectItem key={driver.id} value={driver.name}>
                            {driver.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reviewText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto de la Reseña del Cliente</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Ej., '¡El conductor fue muy rápido y amable!'" {...field} rows={6} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Analizar Reseña
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Resultado del Análisis</CardTitle>
          <CardDescription>El análisis de la reseña por IA aparecerá aquí.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Analizando...</p>
              </div>
            </div>
          )}
          {!isLoading && analysis && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Sentimiento</h3>
                <div className="flex items-center gap-2 mt-1">
                  <SentimentIcon sentiment={analysis.sentiment} />
                  <p className="text-lg font-semibold capitalize">{analysis.sentiment}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Resumen</h3>
                <p className="mt-1">{analysis.summary}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Etiquetas de Desempeño</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {analysis.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-base">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
           {!isLoading && !analysis && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p>Los resultados se mostrarán aquí una vez que se envíe una reseña.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
