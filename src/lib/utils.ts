import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `rounded-card` (radio de las tarjetas de vidrio, tailwind.config.ts) es un valor propio:
// sin avisarle a tailwind-merge, un `rounded-none`/`rounded-lg` pasado a una <Card> no lo
// reemplazaba y ganaba el que Tailwind escribe más abajo en el CSS (el de la tarjeta).
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['card'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
