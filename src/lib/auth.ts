// En una aplicación real, obtendrías el usuario actual de una sesión o token.
// Por ahora, esto simula un usuario administrador que ha iniciado sesión.

// TODO: Implementar la obtención del usuario desde Firebase Auth.
// Esto requerirá probablemente una solución que funcione tanto en servidor como en cliente.
export const getCurrentUser = () => {
  // Temporalmente, devolvemos un objeto de usuario que no es admin
  // para que la interfaz por defecto no muestre el panel de admin.
  // La lógica real vendrá de Firebase.
  return {
    name: 'Admin User',
    email: 'admin@email.com',
    role: 'admin', // Asignamos el rol de admin para las pruebas.
  };
};
