// Bandera anti-carrera del registro (Fase RR quinquies).
//
// Bug real encontrado en la prueba con gente: al crear la cuenta de Auth, el fallback de
// auth-context (que crea un perfil mínimo cuando falta — pensado para el login con
// Google, Fase X) a veces GANABA la carrera y escribía users/{uid} ANTES que el batch
// del signup. El batch pasaba de "create" a "update" con campos prohibidos (role/email/
// uid) → permission-denied → el signup mostraba "ese teléfono ya tiene cuenta" (mapeo
// engañoso del error) → el rollback borraba la cuenta de Auth pero el doc del fallback
// quedaba huérfano. Cada reintento sumaba un huérfano más (se encontraron 4 por persona).
//
// Los 3 signups levantan la bandera mientras crean la cuenta; el fallback de
// auth-context no escribe nada mientras esté levantada (el snapshot se re-dispara solo
// cuando el batch del signup termina).

let signupInProgress = false;

export const setSignupInProgress = (value: boolean): void => {
  signupInProgress = value;
};

export const isSignupInProgress = (): boolean => signupInProgress;
