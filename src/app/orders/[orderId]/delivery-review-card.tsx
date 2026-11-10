'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/order-service';

interface DeliveryReviewCardProps {
    order: Order;
    onSubmit: (rating: number, review: string) => Promise<void>;
}

export function DeliveryReviewCard({ order, onSubmit }: DeliveryReviewCardProps) {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [review, setReview] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (rating === 0) return;
        setIsSubmitting(true);
        try {
            await onSubmit(rating, review);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-2xl font-extrabold">¿Cómo fue la entrega?</CardTitle>
                <CardDescription>
                    Valora tu experiencia con el repartidor, {order.deliveryPersonName}. Tu opinión es importante.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Estrellas como BOTONES (antes eran íconos sueltos: sin teclado ni nombre). */}
                <div role="radiogroup" aria-label="Calificación del repartidor" className="flex items-center justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            type="button"
                            role="radio"
                            aria-checked={rating === star}
                            aria-label={`${star} de 5: ${['Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'][star - 1]}`}
                            className="grid h-12 w-12 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95 motion-reduce:transform-none"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                        >
                            <Star aria-hidden="true" className={cn('h-9 w-9 transition-colors', (hoverRating || rating) >= star ? 'text-warning fill-warning' : 'text-muted-foreground/30')} />
                        </button>
                    ))}
                </div>
                <Textarea
                    placeholder={`Deja un comentario para ${order.deliveryPersonName}... (opcional)`}
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    rows={3}
                    disabled={isSubmitting}
                />
            </CardContent>
            <CardFooter>
                <Button onClick={handleSubmit} disabled={rating === 0 || isSubmitting} className="h-12 w-full rounded-full">
                    {isSubmitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    Enviar Valoración
                </Button>
            </CardFooter>
        </Card>
    );
}