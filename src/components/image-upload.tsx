'use client';

import { useState, useRef, useEffect } from 'react';
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
  // Qué se sube ("Licencia — frente"): solo para el texto que anuncia el botón.
  label?: string;
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
  label,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Sincronizar el preview cuando la imagen actual llega DESPUÉS del primer render
  // (típico: el perfil carga de Firestore un instante más tarde). Sin esto, el avatar
  // del perfil mostraba el placeholder aunque el usuario SÍ tuviera foto guardada.
  useEffect(() => {
    if (!isUploading) setPreviewUrl(currentImageUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImageUrl]);

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
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleFileClick}
          disabled={isUploading}
          aria-label={label ? `Cambiar ${label}` : 'Cambiar foto de perfil'}
          className="group relative rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="h-24 w-24 ring-4 ring-background/70 shadow-[var(--glass-shadow)] transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none">
            <AvatarImage src={previewUrl} className="object-cover" />
            <AvatarFallback className="bg-muted">
                {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <UserIconPlaceholder />}
            </AvatarFallback>
          </Avatar>
          {/* Overlay de edición */}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="h-6 w-6 text-white" aria-hidden="true" />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background" aria-hidden="true">
            <Camera className="h-4 w-4" />
          </span>
        </button>

        <Button variant="outline" onClick={handleFileClick} disabled={isUploading} className="h-11 rounded-2xl bg-background/60 px-5">
          {isUploading ? "Subiendo..." : "Cambiar foto"}
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

  // Variante Banner/Producto/Documento: un botón real (antes un div con onClick, que no se
  // podía usar con teclado ni lo anunciaba un lector de pantalla).
  return (
    <div className="w-full">
        <button
            type="button"
            onClick={handleFileClick}
            disabled={isUploading}
            aria-label={previewUrl ? `Cambiar ${label || 'imagen'}` : `Subir ${label || 'imagen'}`}
            className="group relative flex h-48 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-foreground/20 bg-background/40 p-6 text-center outline-none ring-offset-background transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait"
        >
            {previewUrl ? (
                <>
                    <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="glass-strong absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground">
                        <Camera className="h-4 w-4" aria-hidden="true" /> Cambiar
                    </span>
                </>
            ) : (
                <>
                    <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none">
                        <UploadCloud className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <span className="text-base font-semibold text-foreground">Tocá para subir una foto</span>
                    <span className="mt-0.5 text-sm text-muted-foreground">Desde la cámara o la galería</span>
                </>
            )}

            {isUploading && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-sm font-semibold text-foreground" role="status">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                    Subiendo…
                </span>
            )}
        </button>
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
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    )
}
