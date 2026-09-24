// Guion del recorrido en LOCAL, paso a paso.
//
// El diseño y el montaje viven en nd-doc.mjs, el lenguaje D, el mismo de los demás
// entregables. Aquí solo va el contenido.
//
// Todo lo que dice está comprobado contra la copia local el 23/09/2026: los
// números de alojamientos y actividades salen de consultar la propia app, no
// de estimarlos.

export const META = {
  cliente: 'Oravia Travel Group',
  sub: 'Consola de operaciones · prueba en local',
  titulo: 'Recorrido guiado en local: qué hacer y qué tiene que pasar',
  kicker: 'Neointec × Oravia Travel Group · 23 de septiembre de 2026',
  lede:
    'Once paradas para probar en la copia local todo lo que se ha corregido y que todavía no está en el servidor. Cada una dice qué hacer, qué tiene que pasar y, cuando es importante, por qué. Si algo no coincide con lo que aquí pone, eso es lo que hay que contarme.',
  fuentes: [
    { b: 'Copia local', s: 'espejo del servidor, 34 alojamientos y 20 actividades' },
    { b: 'Siete commits', s: 'lo corregido y sin desplegar' },
    { b: 'Comprobado', s: 'consultando la app el 23/09/2026' },
  ],
  pie: [
    'localhost:5173',
    'API en 8787',
    'admin@viajesvelero.com',
  ],
  sigla: 'OR',
  version: 'Recorrido guiado · v2',
  tags: ['PRUEBA EN LOCAL', 'PASO A PASO', 'ANTES DE DESPLEGAR'],
  // Propios del formato D: la píldora del rail y los tres datos de portada.
  estado: { texto: 'Para probar en local · 24/09/2026' },
  hechos: [
    { icono: 'lista', v: '11 paradas', k: 'con lo que tiene que pasar en cada una' },
    { icono: 'capas', v: '34 alojamientos', k: 'y 20 actividades en la copia local' },
    { icono: 'check', v: '217 pruebas', k: 'automáticas, en verde' },
  ],
}

/* ---------------------------------------------------------------- arranque */

const ARRANQUE = {
  id: 'arranque', icono: 'ajustes', grupo: 'Antes de empezar', label: 'Arrancar',
  h2: 'Levantar la copia local',
  lede:
    'Ya está arrancada. Esto es por si hay que volver a levantarla otro día, o si se cierra la terminal.',
  blocks: [
    {
      t: 'tabla', cap: 'Tres terminales, en este orden',
      cols: [{ h: 'Qué' }, { h: 'Comando' }, { h: 'Qué tiene que salir' }],
      rows: [
        ['La base de datos', '<code>npm run db:local</code>', 'Se queda abierta. PostgreSQL embebido, sin Docker.'],
        ['La app', '<code>npm run dev</code>', 'API en el 8787 y web en el 5173.'],
        ['El catálogo', '<code>node --import tsx scripts/espejar-catalogo.mjs --limpiar</code>', '34 alojamientos, 20 actividades, 4 documentos.'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Por qué el espejo',
      p: [
        'La copia local tenía 29 alojamientos sembrados de un Excel y <b>cero actividades</b>. Sin actividades no se podía probar aquí ni la búsqueda ni el programa por opción, que es justo uno de los bloques corregidos.',
        'El espejo trae lo mismo que hay en el servidor. Tiene un límite conocido: algunas búsquedas de alojamiento dan menos resultados que en producción, porque el resumen del servidor no trae dos campos por los que la búsqueda agrupa. Sirve para probar el recorrido, no para comparar cifras.',
      ],
    },
    {
      t: 'tabla', cap: 'Dónde entrar',
      cols: [{ h: 'Qué' }, { h: 'Dónde' }],
      rows: [
        ['La app', '<code>http://localhost:5173</code>'],
        ['Usuario', '<code>admin@viajesvelero.com</code>'],
        ['Contraseña', 'la de siempre'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- 1 a 4 */

const LEER = {
  id: 'leer', icono: 'lupa', grupo: 'El recorrido', label: '1 · Leer',
  h2: 'Pegar el correo y ver qué entiende',
  lede: 'La primera parada prueba tres correcciones de golpe: el centro, la edad y el nombre de la oportunidad.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Arriba a la derecha, botón «Nueva solicitud». Pega esto tal cual.' },
    {
      t: 'html',
      html: `<div class="tw"><table><tbody><tr><td class="strong" style="white-space:pre-wrap;font-family:var(--f-mono);font-size:12px;line-height:1.7">Buenos días:

Soy Marta Ferrer, del IES Jaume Balmes de Barcelona. Estamos preparando el
viaje de fin de curso a Salou del 18 al 22 de mayo de 2027.

Seríamos 48 alumnos de entre 15 y 17 años, más 4 profesores acompañantes.
Nos interesa un hotel de 3 estrellas en pensión completa.

Tenemos dos alumnos celíacos y una alumna con movilidad reducida. El
presupuesto que manejamos es de unos 300 € por alumno.

Un saludo,
Marta Ferrer
marta@iesjaumebalmes.cat</td></tr></tbody></table></div>`,
    },
    { t: 'sec', h3: 'Qué tiene que pasar', note: 'Pulsa «Ver lo que hemos entendido».' },
    {
      t: 'tabla', tick: 'p1',
      cols: [{ h: 'Campo' }, { h: 'Tiene que salir' }, { h: 'Qué prueba' }],
      rows: [
        ['Centro', '<code>IES Jaume Balmes</code>', '<b>Campo nuevo.</b> Antes no existía, y por eso la cuenta de Zoho se creaba con el nombre de la persona.'],
        ['Nombre del viaje', '<code>IES JAUME BALMES 2027</code>', 'Ahora sigue vuestra convención. Antes salía «Viaje fin de curso Salou 2027».'],
        ['Destino', '<code>Salou</code>', ''],
        ['Desde · Hasta', '<code>2027-05-18</code> · <code>2027-05-22</code>', ''],
        ['Alumnos · Profesores', '<code>48</code> · <code>4</code>', ''],
        ['Edades', '<code>15-17</code>', 'El campo que no existía en la reunión.'],
        ['Régimen', '<code>pensión completa</code>', ''],
        ['Categoría', '<code>3*</code>', ''],
        ['Presupuesto por alumno', '<code>300</code>', 'Antes se llamaba «Tope» y no se entendía.'],
      ],
    },
    {
      t: 'nota', tone: 'ok', kicker: 'Fíjate en dos detalles',
      p: [
        'El correo no dice el nombre en una línea aparte y aun así saca «Marta Ferrer» de la firma.',
        'Y sin que nadie marque nada, detecta los dos requisitos especiales: alergias y habitación adaptada.',
      ],
    },
  ],
}

const SIN_EDAD = {
  id: 'sinedad', icono: 'capas', grupo: 'El recorrido', label: '2 · Sin edad',
  h2: 'Un correo sin edad ya no bloquea',
  lede: 'Lo pidió Javier y se confirmó en la reunión: «a veces no sabemos la edad al principio, no debería ser un requisito obligatorio».',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Borra el contenido del campo «Edades» y vuelve a buscar.' },
    {
      t: 'tabla', tick: 'p2',
      cols: [{ h: 'Qué tiene que pasar' }, { h: 'Qué NO tiene que pasar' }],
      rows: [
        [
          'Se puede seguir. Las actividades salen todas y se descarta a mano.',
          'Que aparezca en rojo «hace falta una edad o rango de edad» y no deje avanzar.',
        ],
        [
          'La edad sigue apareciendo como dato pendiente, en aviso.',
          'Que desaparezca del todo: sigue siendo útil, solo que no obligatoria.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'En el servidor esto todavía falla',
      p: ['Era crítico en tres sitios a la vez: al leer el mensaje, al validar antes de enviar, y en la búsqueda de actividades, que devolvía cero en vez de buscar.'],
    },
  ],
}

const ACTIVIDADES = {
  id: 'actividades', icono: 'libro', grupo: 'El recorrido', label: '3 · Actividades',
  h2: 'Las actividades aparecen',
  lede:
    'Es la corrección más gorda de esta tanda. En el servidor, buscar Salou devuelve CERO actividades teniendo 402 tarifas publicadas.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Vuelve a poner las edades y mira el bloque de actividades.' },
    {
      t: 'stats',
      items: [
        { v: '19', k: 'actividades en Salou', h: 'en local, ahora' },
        { v: '0', k: 'en el servidor', h: 'con la misma búsqueda' },
        { v: '402', k: 'tarifas publicadas', h: 'las que no se encontraban' },
      ],
    },
    {
      t: 'tabla', tick: 'p3',
      cols: [{ h: 'Destino' }, { h: 'Tienen que salir' }],
      rows: [
        ['Salou', '<span class="mono">19</span> actividades'],
        ['Vila-seca', '<span class="mono">19</span>'],
        ['Cambrils', '<span class="mono">11</span>'],
        ['Jaca', '<span class="mono">0</span> · correcto, es otra comarca'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Qué estaba pasando',
      p: [
        'Una actividad tiene <b>dos sitios distintos</b> y la app solo guardaba uno. Dónde ocurre, que es «PortAventura Park», y en qué pueblo está, que es Vila-seca o Salou.',
        'Ocho actividades tenían el nombre del parque y las otras doce no tenían nada. Ninguna de las dos formas aparece buscando por localidad, que es lo único que escribe un colegio.',
        'Y algo que conviene saber: el arreglo que hice hace dos semanas <b>no bastaba</b>. Rellenaba la ubicación con la del documento solo cuando la IA no decía nada, y en PortAventura la IA sí decía algo.',
      ],
    },
  ],
}

const AVISO = {
  id: 'aviso', icono: 'rayo', grupo: 'El recorrido', label: '4 · El aviso',
  h2: 'El aviso dice qué falta, no manda a adivinar',
  lede: 'Esto costó veinte minutos de la reunión del 21, con once personas delante.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Tres pruebas, una por cada caso. Borra el campo, busca, y lee el aviso.' },
    {
      t: 'tabla', tick: 'p4',
      cols: [{ h: 'Borra esto' }, { h: 'Tiene que decir' }],
      rows: [
        ['El destino', '«Falta el destino: la petición no dice a qué pueblo van»'],
        ['Las fechas', '«Faltan las fechas del viaje»'],
        ['Pon 2026 en las fechas', '«No hay tarifas de 2026. El catálogo cargado cubre 2027»'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Lo que pasaba en la reunión',
      p: [
        'La petición del colegio no traía destino, solo decía la actividad. Pero el aviso era siempre el mismo, «revisa el destino o las fechas», así que se probó 2026, 2027, octubre y junio antes de caer en que lo que faltaba era el pueblo.',
        '«Revisa A o B» cuando el sistema sabe cuál de los dos falla no es ayudar: es repartir el trabajo de diagnóstico al que menos información tiene.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- 5 a 7 */

const OPCIONES = {
  id: 'opciones', icono: 'check', grupo: 'El recorrido', label: '5 · Opciones',
  h2: 'Elegir los hoteles',
  lede: 'Aquí se prueban dos correcciones visuales que en el servidor ya funcionan, y una que no.',
  blocks: [
    {
      t: 'tabla', tick: 'p5',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Mirar la lista', 'Quince alojamientos en Salou, con su precio <b>por alumno</b> y la etiqueta <code>cabe</code> si entra en los 300 €.'],
        ['Buscar «Cambrils» en el destino', 'Salen también los de Salou, con la etiqueta <code>cerca</code>. Están a diez minutos y muchas veces son la mejor opción; lo que faltaba era decirlo.'],
        ['Pulsar «Detalle» en cualquiera', 'Se abre su ficha: gratuidades, condiciones y de qué documento salió la tarifa.'],
        ['Marcar tres de 3 estrellas', 'Por ejemplo Santa Mónica Playa, Planas y Eurosalou: tres precios claramente distintos.'],
        ['Probar «Comparar»', 'Las tres opciones en columnas.'],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'No marques este',
      p: ['<code>ESTIDIANTES 4R27 3E</code> es un registro de una prueba antigua, con errata en el nombre. Duplica un hotel del maestro y al mismo precio. Está en la lista de cosas a borrar.'],
    },
  ],
}

const BORRADORES = {
  id: 'borradores', icono: 'reloj', grupo: 'El recorrido', label: '6 · Borradores',
  h2: 'Los borradores, que es lo que pidió Ruth',
  lede:
    'Sus puntos 4 y 5 eran la misma causa: el borrador vivía en el navegador bajo UNA sola clave. Esta parada es la que hay que probar con más calma.',
  blocks: [
    {
      t: 'tabla', tick: 'p6',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        [
          'Sal del lienzo con «Salir» y vuelve a entrar en «Nueva solicitud»',
          'Arriba aparece una lista de <b>solicitudes a medias</b> con su título compuesto: centro, destino y fecha.',
        ],
        [
          'Pulsar una de la lista',
          'Se recupera entera: los mensajes, los campos corregidos a mano y los hoteles marcados. Y vuelve a buscar, porque las tarifas pueden haber cambiado.',
        ],
        [
          'Empezar OTRA solicitud distinta',
          '<b>La anterior no se pierde.</b> Este era el fallo: solo había un borrador y empezar otro pisaba el anterior.',
        ],
        [
          'Volver a la lista',
          'Están las dos.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Dos decisiones que conviene que veas',
      p: [
        '<b>La visibilidad es más abierta que la de las propuestas, a propósito.</b> Un cotizador ve los borradores de su departamento, no solo los suyos. Es lo que pidió Ruth: si quien lo empezó está de baja, su compañera tiene que poder continuarlo.',
        '<b>No hay cerrojo duro.</b> Si otra persona lo tiene abierto se avisa de quién es y se puede tomar igualmente. Un cerrojo de verdad convierte unas vacaciones en un bloqueo. La reserva caduca a los 30 minutos.',
      ],
    },
  ],
}

const CIERRE = {
  id: 'cierre', icono: 'escudo', grupo: 'El recorrido', label: '7 · Cerrar',
  h2: 'Hasta dónde llegar en local',
  lede: 'Aquí hay que parar antes del final, y conviene saber por qué.',
  blocks: [
    {
      t: 'nota', tone: 'no', kicker: 'En local, el CRM es el REAL de Oravia',
      p: [
        'Las credenciales de Zoho de la copia local son las de producción. Pulsar «Revisar y enviar» <b>crea una oportunidad de verdad</b> en su CRM.',
        'Así que: o paras antes de ese botón, o le pones al viaje un nombre con <code>PRUEBA</code> delante y lo borras después.',
      ],
    },
    {
      t: 'tabla', tick: 'p7',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Si decides seguir: poner <code>PRUEBA</code> en el nombre del viaje', 'Para poder encontrarlo en Zoho y borrarlo.'],
        ['Pulsar «Revisar y enviar»', 'Aparece la referencia <code>ORV-2026-####</code> y la pantalla de revisión.'],
        ['Descargar el PDF', 'Dos páginas, no cuatro. Sin páginas en blanco. El desglose multiplica bien contra el total.'],
        ['Leer las observaciones del PDF', 'No puede aparecer «precios netos (coste)» ni el nombre de ningún fichero interno.'],
        ['El correo sale simulado', 'En local no hay clave de buzón, así que dice «preparada, no ha salido». Eso no es un error.'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- extras */

const DOCUMENTAL = {
  id: 'documental', icono: 'lista', grupo: 'Si te queda tiempo', label: 'Suplementos',
  h2: 'Los suplementos repetidos',
  lede:
    'Es la última corrección y solo se ve subiendo un documento nuevo, así que va aparte.',
  blocks: [
    {
      t: 'nota', tone: 'q', kicker: 'Qué pasaba',
      p: [
        'El maestro de hoteles es una hoja con una fila por tarifa, y las condiciones del hotel están escritas <b>en cada fila</b>. Un hotel con seis temporadas, dos regímenes y tres ocupaciones repite sus suplementos treinta y seis veces.',
        'La lectura los proponía todos, y alguien tenía que aprobarlos o descartarlos de uno en uno.',
      ],
    },
    {
      t: 'tabla', tick: 'doc',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Subir un documento en Tarifas y leerlo con IA', 'Tarda entre dos y veinte minutos. <b>Tiene coste</b>, así que solo si hace falta.'],
        ['Mirar los avisos del documento', 'Dice cuántos suplementos se agruparon y cuántos distintos quedan.'],
        ['Mirar un suplemento agrupado', 'Pone «repetido en 36 filas del documento». Esa cuenta es información: uno que sale en las 36 filas es del hotel; uno que sale en 2 puede ser de una temporada.'],
      ],
    },
  ],
}

const QUEDA = {
  id: 'queda', icono: 'bombilla', grupo: 'Si te queda tiempo', label: 'Qué falta',
  h2: 'Lo que NO se puede probar en local',
  lede: 'Para que no pierdas tiempo buscándolo.',
  blocks: [
    {
      t: 'rules',
      items: [
        { no: true, t: 'Los idiomas', d: 'Catalán, inglés y francés siguen sin leerse. Espera a que decidáis si lo lee la IA.' },
        { no: true, t: 'Los correos por oportunidad', d: 'Requiere el módulo de correo de Zoho, que no hemos tocado.' },
        { no: true, t: 'El envío de verdad', d: 'En local el correo sale simulado: no hay clave de buzón.' },
        { no: true, t: 'La página pública', d: 'Funciona, pero el enlace apunta a localhost.' },
        { t: 'Las cifras exactas del catálogo', d: 'El espejo agrupa algunas tarifas de más. Para comparar números, el servidor.' },
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Y lo más importante',
      p: [
        'Todo esto son <b>siete commits en main que no llegan al servidor</b>, tres de ellos con migración de base de datos. El despliegue automático sigue fallando en el paso de SSH.',
        'Lo que pruebes hoy en local no lo tiene Oravia hasta que eso se arregle.',
      ],
    },
  ],
}

export const PANELS = [ARRANQUE, LEER, SIN_EDAD, ACTIVIDADES, AVISO, OPCIONES, BORRADORES, CIERRE, DOCUMENTAL, QUEDA]
