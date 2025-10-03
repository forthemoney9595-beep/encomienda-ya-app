'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from '@/lib/placeholder-data';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Rating } from "@/components/ui/rating";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPlaceholderImage } from "@/lib/placeholder-images";
import { useMemo } from "react";

interface ProductReviewsDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  product: Product | null;
}

// Simulated reviews for prototype purposes
const generateSimulatedReviews = (product: Product | null) => {
    if (!product || product.reviewCount === 0) return [];
    
    const reviews = [];
    const positiveComments = ["¡Excelente producto!", "Me encantó, lo recomiendo.", "Justo lo que esperaba.", "Buena calidad, volvería a comprar."];
    const neutralComments = ["Está bien, cumple su función.", "No está mal.", "Es aceptable."];
    const negativeComments = ["No me gustó mucho.", "Esperaba algo mejor.", "El producto no era como en la foto."];

    for (let i = 0; i < product.reviewCount; i++) {
        const seed = `${product.id}-${i}`;
        const rating = 3 + Math.floor(Math.random() * 3); // Random rating between 3 and 5
        
        let comment = "";
        if (rating === 5) {
            comment = positiveComments[i % positiveComments.length];
        } else if (rating === 4) {
            comment = neutralComments[i % neutralComments.length];
        } else {
            comment = negativeComments[i % negativeComments.length];
        }

        reviews.push({
            id: `review-${seed}`,
            author: `Cliente ${i + 1}`,
            rating: rating,
            comment: comment,
            avatar: getPlaceholderImage(`avatar-${seed}`, 40, 40)
        });
    }
    return reviews.sort((a, b) => b.rating - a.rating);
};


export function ProductReviewsDialog({ isOpen, setIsOpen, product }: ProductReviewsDialogProps) {

  const simulatedReviews = useMemo(() => generateSimulatedReviews(product), [product]);

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reseñas de: {product.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Rating rating={product.rating} size={16} />
            <span>{product.rating.toFixed(1)} de 5 estrellas ({product.reviewCount} reseñas)</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
            <div className="space-y-4 pr-6">
            {simulatedReviews.map(review => (
                <div key={review.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={review.avatar} alt={review.author} />
                            <AvatarFallback>{review.author.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold text-sm">{review.author}</p>
                            <Rating rating={review.rating} size={14} />
                        </div>
                    </div>
                    {review.comment && (
                        <p className="text-sm text-muted-foreground ml-11">
                            {review.comment}
                        </p>
                    )}
                    <Separator className="mt-2" />
                </div>
            ))}
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}