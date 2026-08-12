'use client';

// Visor de imagen completa (Fase RR sexies) — pedido de la gran prueba: "ajustar las
// imágenes o poner pop para que al darle click salga la imagen completa". Las tarjetas
// recortan con object-cover (correcto para el grid); este visor muestra la foto ENTERA
// sin recortes, a pantalla casi completa, tocando la imagen.

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ImageLightboxProps {
  /** URL a mostrar; null = cerrado. */
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-2 sm:p-3 bg-background/95">
        {/* Título accesible (oculto): Radix exige un DialogTitle presente */}
        <DialogTitle className="sr-only">{alt || 'Imagen'}</DialogTitle>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || 'Imagen'}
            className="w-full max-h-[80vh] object-contain rounded-md cursor-zoom-out"
            onClick={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
