import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Si el 5173 esta ocupado, fallar en vez de saltar al siguiente libre.
    //
    // Sin esto Vite se mueve solo y no avisa mas que con una linea entre el
    // ruido del arranque: el 26/08/2026 otro proyecto tenia cogidos el 5173 y
    // el 5174, la app acabo en el 5175, y en el 5173 se veia la OTRA app. Diez
    // minutos buscando un fallo que no existia.
    //
    // Ademas el puerto no es libre: ZOHO_REDIRECT_URI (dado de alta en la
    // consola de Zoho) apunta a http://localhost:5173/callback. Servida en otro
    // puerto, el retorno de la autenticacion de Zoho no vuelve.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  },
  // `npm run preview` sirve el dist/ compilado con el mismo reparto que hara
  // nginx en el servidor. Sirve para probar el bundle de produccion sin
  // desplegar: es lo unico que detecta un dist/ viejo o mal construido.
  preview: {
    port: 4173,
    // Por lo mismo: verificar-despliegue.sh apunta al 4173 por defecto, y
    // comprobar el bundle en un puerto que no es el que crees no comprueba nada.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  }
});
