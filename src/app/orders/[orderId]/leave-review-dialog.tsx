'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaveReviewDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  productName: string;
  onSubmit: (rating: number, review: string) => void;
}

export function LeaveReviewDialog({ isOpen, setIsOpen, productName, onSubmit }: LeaveReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      onSubmit(rating, review);
      setIsSubmitting(false);
      setIsOpen(false);
      setRating(0);
      setReview('');
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Valorar: {productName}</DialogTitle>
          <DialogDescription>
            Selecciona una calificación y deja un comentario sobre el producto.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex justify-center items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  'h-8 w-8 cursor-pointer transition-colors',
                  (hoverRating || rating) >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/50'
                )}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
              />
            ))}
          </div>
          <Textarea
            placeholder="Escribe tu opinión aquí..."
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={rating === 0 || isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar Valoración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}