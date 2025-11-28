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
    onSubmit: (rating: number, review: string) => void;
}

export function DeliveryReviewCard({ order, onSubmit }: DeliveryReviewCardProps) {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [review, setReview] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = () => {
        if (rating === 0) return;
        setIsSubmitting(true);
        setTimeout(() => {
            onSubmit(rating, review);
            setIsSubmitting(false);
        }, 800);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>¿Cómo fue la entrega?</CardTitle>
                <CardDescription>
                    Valora tu experiencia con el repartidor, {order.deliveryPersonName}. Tu opinión es importante.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-center items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                            key={star}
                            className={cn(
                                'h-10 w-10 cursor-pointer transition-all',
                                (hoverRating || rating) >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                            )}
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                        />
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
                <Button onClick={handleSubmit} disabled={rating === 0 || isSubmitting} className="w-full">
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