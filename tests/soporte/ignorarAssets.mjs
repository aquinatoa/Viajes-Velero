/**
 * Para probar componentes de la pantalla fuera de Vite: las imágenes y los
 * estilos que importan (`import logo from "./logo.png"`) solo los entiende el
 * empaquetador. Aquí se sustituyen por un texto vacío.
 */
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    if (/\.(png|jpe?g|svg|webp|gif|ico|css)(\?.*)?$/.test(url)) {
      return { format: "module", shortCircuit: true, source: "export default '';" };
    }
    return nextLoad(url, context);
  },
});
