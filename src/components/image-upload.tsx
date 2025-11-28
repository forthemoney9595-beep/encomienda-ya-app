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
  variant?: 'avatar' | 'banner';
}

export function ImageUpload({ 
  currentImageUrl, 
  onImageUploaded, 
  folder = 'uploads',
  variant = 'avatar' 
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

    // Validar tamaño (ej. max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: "La imagen debe pesar menos de 2MB.",
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
      // Referencia en Firebase Storage: uploads/timestamp_nombre.jpg
      const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
      
      // Subir
      const snapshot = await uploadBytes(storageRef, file);
      
      // Obtener URL pública
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      onImageUploaded(downloadURL);
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