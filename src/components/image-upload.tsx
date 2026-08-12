'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// ✅ CORRECCIÓN: Apuntamos a la ubicación correcta en @/lib/firebase
import { storage } from '@/lib/firebase';

interface ImageUploadProps {
  currentImageUrl?: string;
  onImageUploaded: (url: string) => void;
  folder?: string; // 'profiles', 'products', etc.
  // Uid del usuario o id de la tienda dueña del archivo -- se mete en el path para que
  // storage.rules pueda comprobar quién puede leer/escribir cada archivo (ver licenses/).
  ownerId: string;
  variant?: 'avatar' | 'banner';
  // Para archivos sensibles (licencias/DNI): en vez de devolver la URL pública con token
  // permanente de getDownloadURL(), devuelve solo el PATH del archivo. Quien lo muestre
  // tiene que pedir una URL firmada de corta duración vía /api/licenses/signed-url -- así
  // el archivo no queda accesible para siempre a cualquiera que consiga el link.
  storeRawPath?: boolean;
}

// Comprime/achica la imagen EN EL NAVEGADOR antes de subir (Fase RR sexies). Antes había
// un límite duro de 2MB que rechazaba cualquier foto de celular moderno (3-8MB) — "quise
// poner una imagen más grande y no funciona", falla real de la gran prueba. Ahora
// cualquier foto entra: se reescala al lado máximo indicado y se re-encodea a JPEG.
// Bonus: el re-encode descarta los metadatos EXIF (incluida la ubicación GPS de la foto).
async function compressImage(file: File, maxDim: number, quality: number): Promise<{ blob: Blob; renamed: boolean }> {
  // GIFs (animaciones) y formatos que el navegador no decodifica: subir tal cual.
  if (file.type === 'image/gif') return { blob: file, renamed: false };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, renamed: false };
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  // Ya es chica y liviana: no vale la pena re-encodearla.
  if (scale === 1 && file.size < 900 * 1024) return { blob: file, renamed: false };

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: file, renamed: false };
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  // Si por algún motivo el resultado salió más pesado, quedarse con el original.
  if (!blob || blob.size >= file.size) return { blob: file, renamed: false };
  return { blob, renamed: true };
}

export function ImageUpload({
  currentImageUrl,
  onImageUploaded,
  folder = 'uploads',
  ownerId,
  variant = 'avatar',
  storeRawPath = false,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Tope de cordura (las fotos se comprimen solas abajo; esto solo frena archivos absurdos)
    if (file.size > 25 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Archivo demasiado grande",
        description: "La imagen no puede superar los 25MB.",
      });
      return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
        toast({
            variant: "destructive",
            title: "Formato incorrecto",
            description: "Por favor sube un archivo de imagen.",
        });
        return;
    }

    setIsUploading(true);

    // Crear preview local inmediato
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      // Compresión en el navegador (ver compressImage arriba): banners/productos a
      // 1600px de lado máximo; documentos sensibles (licencias/DNI, storeRawPath) a
      // 2200px y más calidad para que sigan siendo legibles al hacer zoom.
      const { blob, renamed } = storeRawPath
        ? await compressImage(file, 2200, 0.92)
        : await compressImage(file, 1600, 0.85);

      // Referencia en Firebase Storage: carpeta/dueño/timestamp_nombre.jpg -- el id del
      // dueño en el path es lo que permite a storage.rules restringir quién puede leer/
      // sobreescribir cada archivo.
      const safeName = renamed ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
      const path = `${folder}/${ownerId}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);

      // Subir
      const snapshot = await uploadBytes(storageRef, blob, renamed ? { contentType: 'image/jpeg' } : undefined);

      if (storeRawPath) {
        // Sensible: no generamos una URL pública permanente, solo devolvemos el path.
        onImageUploaded(path);
      } else {
        const downloadURL = await getDownloadURL(snapshot.ref);
        onImageUploaded(downloadURL);
      }
      toast({
        title: "Imagen subida",
        description: "Tu imagen se ha actualizado correctamente.",
      });

    } catch (error) {
      console.error("Error subiendo imagen:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo subir la imagen. Intenta de nuevo.",
      });
      // Revertir preview si falla
      setPreviewUrl(currentImageUrl);
    } finally {
      setIsUploading(false);
    }
  };

  if (variant === 'avatar') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative group cursor-pointer" onClick={handleFileClick}>
          <Avatar className="h-24 w-24 border-2 border-muted transition-opacity group-hover:opacity-80">
            <AvatarImage src={previewUrl} className="object-cover" />
            <AvatarFallback className="bg-muted">
                {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <UserIconPlaceholder />}
            </AvatarFallback>
          </Avatar>
          
          {/* Overlay de edición */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-6 w-6 text-white" />
          </div>
        </div>
        
        <Button variant="outline" size="sm" onClick={handleFileClick} disabled={isUploading}>
          {isUploading ? "Subiendo..." : "Cambiar Foto"}
        </Button>
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
        />
      </div>
    );
  }

  // Variante Banner/Producto
  return (
    <div className="w-full">
        <div 
            onClick={handleFileClick}
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors h-48 relative overflow-hidden"
        >
            {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
                <>
                    <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click para subir imagen</p>
                </>
            )}
            
            {isUploading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}
        </div>
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
        />
    </div>
  );
}

function UserIconPlaceholder() {
    return (
        <svg
            className="h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    )
}