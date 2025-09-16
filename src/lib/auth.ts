// En una aplicación real, obtendrías el usuario actual de una sesión o token.
// Por ahora, esto simula un usuario administrador que ha iniciado sesión.
export const getCurrentUser = () => {
  return {
    name: 'Admin',
    email: 'admin@email.com',
    role: 'admin', // Posibles roles: 'admin', 'buyer', 'store', 'delivery'
  };
};
