/**
 * Los proveedores que Oravia nombra de varias maneras (reunión del 05/11/2026):
 * «MSH» no enlazaba con Cambrils Park / Mediterranean Sports Hub.
 *
 * Cómo correrla:  npm run test:alias
 *
 * No necesita base de datos ni servidor.
 */
import assert from "node:assert/strict";

import {
  algunCampoCoincide,
  proveedorCanonico,
  variantesDeBusqueda,
} from "../src/domain/aliasDeProveedor";
import { agruparPorProveedor, coincideConBusqueda } from "../src/domain/revisionPorProveedor";
import type { StagingActivity } from "../src/domain/documentImportTypes";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\nEl buscador entiende las siglas");

prueba("«MSH», con cualquier tilde o mayúscula, lleva al grupo de Cambrils Park", () => {
  for (const escrito of ["msh", "MSH", " Msh ", "Mediterranean Sports Hub", "cambrils park"]) {
    const v = variantesDeBusqueda(escrito);
    assert.ok(v.includes("cambrils park"), `${escrito} → ${v.join(" | ")}`);
    assert.ok(v.includes("msh"), escrito);
  }
});

prueba("buscar «MSH» encuentra los alojamientos que no llevan ese nombre", () => {
  assert.ok(algunCampoCoincide(["Mediterrània MED1", "Cambrils", "4*"], "MSH"));
  assert.ok(algunCampoCoincide(["Villa Bonita / Aloha", "Cambrils", null], "msh"));
  assert.ok(algunCampoCoincide(["Mediterrània MED2/3", "Cambrils", null], "Cambrils Park"));
});

prueba("«MSH» no arrastra hoteles de otros proveedores", () => {
  assert.ok(!algunCampoCoincide(["Hotel Planas 3*", "Salou", "3*"], "MSH"));
  assert.ok(!algunCampoCoincide(["4R Salou Park", "Salou", "4*"], "msh"));
});

prueba("una búsqueda a medio escribir no se amplía por casualidad", () => {
  assert.deepEqual(variantesDeBusqueda("ms"), ["ms"]);
  assert.deepEqual(variantesDeBusqueda("mshx"), ["mshx"]);
  assert.deepEqual(variantesDeBusqueda("campo msh"), ["campo msh"]);
});

prueba("lo de siempre no cambia: vacío deja pasar todo y el texto normal busca por contenido", () => {
  assert.equal(algunCampoCoincide(["lo que sea"], ""), true);
  assert.equal(algunCampoCoincide(["lo que sea"], "   "), true);
  assert.equal(algunCampoCoincide(["Hotel Planas 3*", "Salou"], "planas"), true);
  assert.equal(algunCampoCoincide(["Hotel Cèsar Augustus"], "cesar"), true);
  assert.equal(algunCampoCoincide(["Hotel Planas"], "augustus"), false);
});

console.log("\nEl nombre bueno del proveedor");

prueba("las siglas y el nombre comercial son «Cambrils Park»", () => {
  assert.equal(proveedorCanonico("MSH"), "Cambrils Park");
  assert.equal(proveedorCanonico("  mediterranean sports hub "), "Cambrils Park");
  assert.equal(proveedorCanonico("Cambrils Park Resort"), "Cambrils Park");
});

prueba("lo que no está en la tabla se devuelve tal cual", () => {
  assert.equal(proveedorCanonico("Club Nàutic Salou"), "Club Nàutic Salou");
  assert.equal(proveedorCanonico("  PortAventura  "), "PortAventura");
  assert.equal(proveedorCanonico(null), "");
  assert.equal(proveedorCanonico(undefined), "");
});

console.log("\nLa revisión de tarifas");

function actividad(id: string, supplierName: string | null): StagingActivity {
  return {
    id,
    activityName: `Actividad ${id}`,
    supplierName,
    activityType: null,
    locationMain: "Cambrils",
    reviewStatus: "PENDING",
    rates: [],
    policies: [],
  } as unknown as StagingActivity;
}

prueba("«MSH» y «Cambrils Park» salen como UN proveedor, no como dos", () => {
  const grupos = agruparPorProveedor([
    actividad("1", "MSH"),
    actividad("2", "Cambrils Park"),
    actividad("3", "Mediterranean Sports Hub"),
    actividad("4", "Club Nàutic Salou"),
    actividad("5", null),
  ]);
  assert.deepEqual(
    grupos.map((g) => [g.proveedor, g.actividades.length]),
    [
      ["Cambrils Park", 3],
      ["Club Nàutic Salou", 1],
      ["Sin proveedor", 1],
    ],
  );
});

prueba("el buscador de la revisión también entiende «MSH»", () => {
  assert.equal(coincideConBusqueda(actividad("1", "Cambrils Park"), "MSH"), true);
  assert.equal(coincideConBusqueda(actividad("2", "Club Nàutic Salou"), "MSH"), false);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
