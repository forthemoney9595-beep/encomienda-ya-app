
'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingProps extends React.HTMLAttributes<HTMLDivElement> {
  rating: number;
  totalStars?: number;
  size?: number;
  fill?: boolean;
  onRatingChange?: (rating: number) => void;
  variant?: 'display' | 'filter';
}

const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      rating,
      totalStars = 5,
      size = 20,
      fill = true,
      onRatingChange,
      variant = 'display',
      className,
      ...props
    },
    ref
  ) => {
    const [hoverRating, setHoverRating] = React.useState<number>(0);
    const isInteractive = onRatingChange !== undefined;

    const handleMouseEnter = (index: number) => {
      if (!isInteractive) return;
      setHoverRating(index);
    };

    const handleMouseLeave = () => {
      if (!isInteractive) return;
      setHoverRating(0);
    };

    const handleClick = (index: number) => {
      if (!isInteractive) return;
      // If the user clicks the same star again, reset the filter
      if (variant === 'filter' && rating === index) {
        onRatingChange(0);
      } else {
        onRatingChange(index);
      }
    };

    const displayRating = hoverRating || rating;

    return (
      <div
        className={cn('flex items-center gap-0.5', isInteractive && 'cursor-pointer', className)}
        onMouseLeave={handleMouseLeave}
        ref={ref}
        {...props}
      >
        {[...Array(totalStars)].map((_, i) => {
          const starNumber = i + 1;
          return (
            <Star
              key={starNumber}
              size={size}
              className={cn(
                'transition-all',
                displayRating >= starNumber
                  ? 'text-amber-400'
                  : 'text-muted-foreground/30'
              )}
              fill={
                fill && displayRating >= starNumber
                  ? 'currentColor'
                  : 'transparent'
              }
              onMouseEnter={() => handleMouseEnter(starNumber)}
              onClick={() => handleClick(starNumber)}
            />
          );
        })}
      </div>
    );
  }
);

Rating.displayName = 'Rating';

export { Rating };
