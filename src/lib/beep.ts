// Dos tonos cortos con la Web Audio API — sin archivo de audio que mantener.
// Extraído de store-orders-view (Fase RR octies) para reusarlo en el banner de estados
// del pedido en primer plano (punto 4 de la prueba, 18/8). No rompe si el navegador no
// soporta AudioContext o no hubo gesto previo del usuario.
export function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // silencioso
  }
}
