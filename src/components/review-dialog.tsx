'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIALOG_CLOSE_BIG, DIALOG_SHELL } from '@/components/buyer-motion';

interface ReviewDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  productName: string;
  title?: string;
  onSubmit: (rating: number, review: string) => Promise<void>;
}

export function ReviewDialog({ isOpen, setIsOpen, productName, title = 'Calificar Producto', onSubmit }: ReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(rating, review);
      setIsOpen(false);
      // Resetear formulario
      setRating(0);
      setReview('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={cn("sm:max-w-[425px]", DIALOG_SHELL, DIALOG_CLOSE_BIG)}>
        <DialogHeader>
          <DialogTitle className="font-headline text-3xl font-extrabold">{title}</DialogTitle>
          <DialogDescription>
            ¿Qué te pareció <strong>{productName}</strong>? Tu opinión ayuda a otros usuarios.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          {/* Estrellas Interactivas */}
          <div role="radiogroup" aria-label="Calificación" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} de 5`}
                className="grid h-12 w-12 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              >
                <Star 
                  className={cn(
                    "h-9 w-9 transition-colors", 
                    (hoverRating || rating) >= star ? "fill-warning text-warning" : "text-muted-foreground/20"
                  )} 
                />
              </button>
            ))}
          </div>
          
          {/* Texto de calificación */}
          <p className="text-sm font-medium text-muted-foreground h-5">
            {rating === 1 && "Malo"}
            {rating === 2 && "Regular"}
            {rating === 3 && "Bueno"}
            {rating === 4 && "Muy bueno"}
            {rating === 5 && "Excelente"}
            {rating === 0 && hoverRating === 0 && "Selecciona una calificación"}
          </p>
          
          <Textarea 
            placeholder="Escribe un comentario (opcional)..." 
            value={review}
            onChange={(e) => setReview(e.target.value)}
            className="w-full resize-none rounded-xl"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="h-11 rounded-full">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={rating === 0 || isSubmitting} className="h-11 rounded-full">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar Reseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}