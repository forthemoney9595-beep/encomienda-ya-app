// Aviso sonoro de la app (pedido nuevo en la tienda, push con la app abierta, chat).
// Desde el 9/11 delega en notify-sounds.ts, donde viven los sonidos sintetizados.
// No rompe si el navegador no soporta AudioContext o no hubo gesto previo del usuario.
import { playSound } from './notify-sounds';

export function playBeep() {
  playSound();
}
