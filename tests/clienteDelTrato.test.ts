/**
 * Quién es el cliente de una oportunidad: la cuenta y el contacto del trato.
 *
 * Cómo correrla:  npm run test:cliente-trato
 */
import assert from "node:assert/strict";

import { contactoDelCliente, cuentaDelCliente, faseTerminada, tratosDeLaCuenta, webCorta } from "../src/domain/clienteDelTrato";

let pasadas = 0;
let fallidas = 0;
function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLO  ${nombre}`);
    console.log(error);
  }
}

prueba("del contacto solo viaja lo que el CRM tiene relleno", () => {
  const c = contactoDelCliente({ Full_Name: " Evan Kavanagh ", Email: "evan@ejemplo.com", Phone: null, Mobile: "+353 87 000", Title: "", Idioma: "Español" });
  assert.deepEqual(c, { nombre: "Evan Kavanagh", correo: "evan@ejemplo.com", telefono: undefined, movil: "+353 87 000", cargo: undefined, idioma: "Español", ciudad: undefined });
});

prueba("sin nombre completo, el contacto se arma con nombre y apellido; sin nada, no hay contacto", () => {
  assert.equal(contactoDelCliente({ First_Name: "Ana", Last_Name: "Ruiz" })?.nombre, "Ana Ruiz");
  assert.equal(contactoDelCliente({ Email: "sin@nombre.com" }), null);
  assert.equal(contactoDelCliente(null), null);
});

prueba("la cuenta junta ciudad y país, y no inventa lo que falta", () => {
  const a = cuentaDelCliente({ Account_Name: "SPORTS NETWORKING", Phone: "+31 651", Website: "https://sportnetworking.nl/", Account_Type: "B2B", Billing_City: "Salou", Billing_Country: "España" });
  assert.equal(a?.ciudad, "Salou, España");
  assert.equal(a?.tipo, "B2B");
  assert.equal(cuentaDelCliente({ Account_Name: "X", Billing_Country: "España" })?.ciudad, "España");
  assert.equal(cuentaDelCliente({ Phone: "1" }), null, "sin nombre no hay cuenta");
});

prueba("las oportunidades de la cuenta se cuentan y se separan las abiertas", () => {
  const t = tratosDeLaCuenta([
    { fase: "Preparando Presupuesto", n: 5 },
    { fase: "Oportunidad Perdida", n: 3 },
    { fase: "Oportunidad Ganada", n: 2 },
    { fase: "Expediente cerrado", n: 1 },
    { fase: "Pendiente de deposito", n: 4 },
    { fase: "", n: 9 },
    { fase: "Lista de Espera", n: 0 },
  ]);
  assert.equal(t?.total, 15);
  assert.equal(t?.abiertas, 9);
  assert.equal(t?.porFase.length, 5, "se quitan las vacías y las de cero");
  assert.equal(tratosDeLaCuenta(null), null, "si no se pudo contar, no se afirma nada");
  assert.deepEqual(tratosDeLaCuenta([]), { total: 0, abiertas: 0, porFase: [] });
});

prueba("una fase terminada es la ganada, la perdida o la cerrada", () => {
  for (const f of ["Oportunidad Ganada", "Oportunidad Perdida", "Expediente cerrado", "Cierre Administrativo"]) assert.equal(faseTerminada(f), true, f);
  for (const f of ["Preparando Presupuesto", "Pendiente de pago resto", "Lista de Espera"]) assert.equal(faseTerminada(f), false, f);
});

prueba("la web se enseña sin protocolo ni barra final", () => {
  assert.equal(webCorta("https://sportnetworking.nl/"), "sportnetworking.nl");
  assert.equal(webCorta("http://www.ejemplo.com/ruta"), "www.ejemplo.com/ruta");
  assert.equal(webCorta(undefined), "");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
