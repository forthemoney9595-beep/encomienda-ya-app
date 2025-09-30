import data from './placeholder-images.json';

export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
};

export const PlaceHolderImages: ImagePlaceholder[] = data.placeholderImages;

/**
 * Generates a consistent placeholder image URL based on a seed.
 * @param seed A unique string (e.g., user ID, product name) to generate a consistent image.
 * @param width The desired width of the image.
 * @param height The desired height of the image.
 * @returns A URL for a placeholder image.
 */
export function getPlaceholderImage(seed: string, width: number = 100, height: number = 100): string {
    return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}
