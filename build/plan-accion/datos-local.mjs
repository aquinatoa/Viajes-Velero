// Guion del recorrido en LOCAL, paso a paso.
//
// El diseño y el montaje viven en nd-doc.mjs, el lenguaje D, el mismo de los demás
// entregables. Aquí solo va el contenido.
//
// v3 · 25/09/2026. Reescrito de arriba abajo porque el recorrido de la v2 ya no
// existe: el paso 1 tenía un botón «Ver lo que hemos entendido» que se ha
// quitado, y la pantalla de opciones era una lista plana sin podio ni encaje.
//
// TODO lo que aquí se afirma está comprobado contra la copia local el
// 25/09/2026, consultando la propia app y su base: los recuentos, los nombres
// de los hoteles del podio, los precios y las preguntas que hace el chat. Nada
// está estimado.

export const META = {
  cliente: 'Oravia Travel Group',
  sub: 'Consola de operaciones · prueba en local',
  titulo: 'Recorrido guiado en local: qué hacer y qué tiene que pasar',
  kicker: 'Neointec × Oravia Travel Group · 25 de septiembre de 2026',
  lede:
    'Diez paradas para probar en la copia local todo lo corregido y que todavía no está en el servidor. Cada una dice qué hacer y qué tiene que pasar; cuando importa, también por qué. Al pie de cada parada hay un cuadro para escribir lo que NO coincida: eso es exactamente lo que hay que contarme.',
  fuentes: [
    { b: 'Copia local', s: '34 alojamientos y 20 actividades, espejo del servidor' },
    { b: 'Sin desplegar', s: 'nada de esto está todavía en el servidor' },
    { b: 'Comprobado', s: 'consultando la app el 25/09/2026' },
  ],
  pie: [
    'localhost:5173',
    'API en 8787',
    'admin@viajesvelero.com',
  ],
  sigla: 'OR',
  version: 'Recorrido guiado · v3',
  tags: ['PRUEBA EN LOCAL', 'PASO A PASO', 'ANTES DE DESPLEGAR'],
  estado: { texto: 'Para probar en local · 25/09/2026' },
  hechos: [
    { icono: 'lista', v: '10 paradas', k: 'con lo que tiene que pasar en cada una' },
    { icono: 'capas', v: '34 alojamientos', k: 'y 20 actividades en la copia local' },
    { icono: 'check', v: '318 pruebas', k: 'automáticas, en verde' },
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
      t: 'tabla', cap: 'Dos terminales, en este orden',
      cols: [{ h: 'Qué' }, { h: 'Comando' }, { h: 'Qué tiene que salir' }],
      rows: [
        ['La base de datos', '<code>npm run db:local</code>', 'Se queda abierta. PostgreSQL embebido en el 5433, sin Docker.'],
        ['La app', '<code>npm run dev</code>', 'API en el 8787 y web en el 5173.'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Dos trampas que ya han costado tiempo',
      p: [
        '<b>Vite no recoge los cambios si lleva días encendido.</b> Si algo de lo que aquí pone no aparece, casi siempre es esto: parar el servidor, borrar <code>node_modules/.vite</code> y arrancarlo otra vez.',
        '<b>La API no se recarga sola.</b> Tocar algo de <code>server/</code> obliga a reiniciar <code>npm run api</code> a mano.',
      ],
    },
    {
      t: 'tabla', cap: 'Dónde entrar',
      cols: [{ h: 'Qué' }, { h: 'Dónde' }],
      rows: [
        ['La app', '<code>http://localhost:5173</code>'],
        ['Usuario', '<code>admin@viajesvelero.com</code>'],
        ['Contraseña', 'la de <code>.env</code> (<code>ADMIN_PASSWORD</code>)'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'El catálogo ya está',
      p: [
        'La copia local tiene los mismos <b>34 alojamientos, 20 actividades y 4 documentos</b> que el servidor. No hace falta volver a espejarlo.',
        'Tiene un límite conocido: algunas búsquedas dan menos resultados que en producción, porque el resumen del servidor no trae dos campos por los que la búsqueda agrupa. Sirve para probar el recorrido, no para comparar cifras.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- el chat */

const MENSAJE_DEMO = `<div class="tw"><table><tbody><tr><td class="strong" style="white-space:pre-wrap;font-family:var(--f-mono);font-size:12px;line-height:1.7">Buenos días:

Soy Marta Ferrer, del IES Jaume Balmes. Estamos preparando el viaje de fin
de curso para mayo de 2027, del 12 al 16.

Seríamos 48 alumnos de entre 15 y 17 años. Nos interesa un hotel de 3
estrellas en pensión completa.

Tenemos dos alumnos celíacos y una alumna con movilidad reducida.

Un saludo,
Marta Ferrer
marta@iesjaumebalmes.cat</td></tr></tbody></table></div>`

const CHAT = {
  id: 'chat', icono: 'lupa', grupo: 'El recorrido', label: '1 · La petición',
  h2: 'La petición ya es un chat',
  lede:
    'Era un buzón: pegabas el correo, la app leía lo que podía y, si faltaba algo, lo enseñaba como una lista de campos vacíos. Un campo vacío no dice qué escribir ni por qué hace falta. Ahora pregunta.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Arriba a la derecha, «Nueva solicitud». Pega esto tal cual y pulsa la flecha azul de enviar.' },
    { t: 'html', html: MENSAJE_DEMO },
    {
      t: 'nota', tone: 'ok', kicker: 'Fíjate en que este correo NO dice el destino',
      p: ['Es a propósito: es lo que hace que el chat tenga que preguntar. Si el mensaje trae el pueblo, no lo pregunta.'],
    },
    { t: 'sec', h3: 'Qué tiene que pasar · lo que saca solo', note: 'Sin que nadie escriba nada.' },
    {
      t: 'tabla', tick: 'p1a',
      cols: [{ h: 'Campo' }, { h: 'Tiene que salir' }, { h: 'Qué prueba' }],
      rows: [
        ['Centro', '<code>IES Jaume Balmes</code>', 'Antes no existía el campo, y la cuenta de Zoho se creaba con el nombre de la persona.'],
        ['Contacto', '<code>Marta Ferrer</code> · <code>marta@iesjaumebalmes.cat</code>', 'El nombre sale de la firma, no de una línea aparte.'],
        ['Nombre del viaje', '<code>IES JAUME BALMES 2027</code>', 'Vuestra convención. Antes salía «Viaje fin de curso Salou 2027».'],
        ['Desde · Hasta', '<code>2027-05-12</code> · <code>2027-05-16</code>', '<b>Nuevo.</b> «mayo de 2027, del 12 al 16» —el mes delante— antes daba dos fechas vacías.'],
        ['Alumnos', '<code>48</code>', ''],
        ['Edades', '<code>15-17</code>', 'El campo que no existía en la reunión.'],
        ['Régimen · Categoría', '<code>pensión completa</code> · <code>3*</code>', ''],
        ['Lo que pide el centro', '<code>Alergias / dietas</code> y <code>Habitación adaptada</code>', 'Los detecta del texto corrido, sin marcar nada.'],
        ['Destino', 'vacío', 'El correo no lo dice. Por eso lo pregunta.'],
      ],
    },
    { t: 'sec', h3: 'Qué tiene que pasar · lo que pregunta', note: 'Exactamente tres preguntas, en este orden.' },
    {
      t: 'tabla', tick: 'p1b',
      cols: [{ h: '#' }, { h: 'Pregunta' }, { h: 'Cómo se contesta' }],
      rows: [
        ['1', '<b>¿A qué destino quieren ir?</b><br><s>Sin el destino no se puede buscar ningún alojamiento: es lo primero que filtra.</s>', 'Escribe <code>Salou</code> abajo y Enter. <b>No se puede saltar</b>: sale en amarillo y sin «No lo han dicho».'],
        ['2', '<b>¿Han dicho cuánto pueden gastar por alumno?</b>', 'Escribe <code>300</code>. O pulsa «No lo han dicho» y no vuelve a preguntarlo.'],
        ['3', '<b>¿Cuántos profesores van?</b>', 'Escribe <code>4</code>.'],
      ],
    },
    {
      t: 'rules',
      items: [
        { t: 'Una sola casilla de respuesta', d: 'Se escribe abajo y solo abajo. El texto de ayuda cambia con la pregunta: «Salou, Cambrils, Andorra…», luego «300». La pregunta solo lleva atajos, nunca un segundo campo.' },
        { t: 'Un botón de enviar, con icono', d: 'Ya no hay «Añadir mensaje» ni «Ver lo que hemos entendido». La flecha hace lo que toque: si hay pregunta abierta, la contesta; si no, añade el mensaje y lo lee entero.' },
        { t: 'Enter envía, Mayús+Enter parte la línea', d: 'Pegar un correo de ocho líneas sigue funcionando igual.' },
        { t: 'Cada pregunta dice por qué se pregunta', d: 'Debajo del título, en gris. «¿Qué régimen?» es un trámite; «es lo que más mueve el precio» es una razón para contestar.' },
      ],
    },
    {
      t: 'nota', tone: 'ok', kicker: 'Y al terminar',
      p: [
        'Cierra con <b>«Ya tengo lo necesario para recomendar»</b> en verde, y con lo que sigue sin saber. Si has contestado las tres, dice que lo sabe todo.',
        'Cada respuesta relanza la búsqueda al momento: contestas «Salou» y la lista de la derecha aparece; contestas 300 € y se pintan los sellos de <code>cabe</code>.',
      ],
    },
  ],
}

const CONTESTAR = {
  id: 'contestar', icono: 'rayo', grupo: 'El recorrido', label: '2 · Contestar',
  h2: 'Lo que pasa cuando la respuesta no es la esperada',
  lede:
    'Tres comportamientos que conviene ver, porque son los que evitan que se guarde un dato a medias.',
  blocks: [
    {
      t: 'tabla', tick: 'p2',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        [
          'Empieza otra solicitud y, a «¿qué día llegan?», escribe <code>el puente de mayo</code>',
          'Contesta en el hilo: <b>«No he entendido esa fecha. Puedes escribirla como 12/05/2027 o “12 de mayo de 2027”»</b> y vuelve a preguntar. <b>No</b> guarda media fecha.',
        ],
        [
          'A esa misma pregunta, escribe <code>del 12 al 16 de mayo de 2027</code>',
          'Coge las <b>dos</b> fechas y ya no pregunta la salida. Volver a preguntar algo que te acaban de decir es lo que hace abandonar un chat.',
        ],
        [
          'A «¿cuántos alumnos son?», escribe <code>unos 48</code>',
          'Lo entiende: <code>48</code>. Nadie escribe solo el número.',
        ],
        [
          'A «¿cuántos alumnos son?», escribe <code>bastantes</code>',
          'Dice «Ahí necesito un número. Por ejemplo: 48.»',
        ],
        [
          'Pulsa «No lo han dicho» en el tope por alumno',
          'Se anota en el hilo y <b>no se vuelve a preguntar</b>. Pero el cierre sigue diciendo «sigo sin saber el tope por alumno»: haberlo preguntado no es saberlo.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Por qué «No lo han dicho» no rellena nada',
      p: [
        'Si el colegio no dijo el régimen, la petición se queda <b>sin régimen</b> y el encaje no lo comprueba. Ponerle «pensión completa» porque es lo habitual sería inventarse lo que pidió un cliente, y eso acaba en un presupuesto que no corresponde a nada.',
        'Por lo mismo, las tres que bloquean —destino, fechas y alumnos— no ofrecen esa salida: sin ellas no hay nada que buscar, y dejarte saltarlas solo lleva a una pantalla vacía sin explicación.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- opciones */

const PODIO = {
  id: 'podio', icono: 'escudo', grupo: 'El recorrido', label: '3 · El podio',
  h2: 'El podio de los tres recomendados',
  lede:
    'La funcionalidad que se había trabajado y se perdió por el camino. Vuelve, pero ordenando por otra cosa: por cuántas de las cosas que pidió ESTE centro cumple cada hotel.',
  blocks: [
    {
      t: 'stats',
      items: [
        { v: '3', k: 'recomendados', h: 'de 19 alojamientos en Salou' },
        { v: '0', k: 'incumplimientos', h: 'ninguno de los tres falla nada' },
        { v: '19', k: 'en la lista larga', h: 'debajo, completa' },
      ],
    },
    { t: 'sec', h3: 'Qué tiene que salir', note: 'Con la petición de Marta: Salou, 12-16 mayo 2027, 48 alumnos, 3★, pensión completa, tope 300 €.' },
    {
      t: 'tabla', tick: 'p3',
      cols: [{ h: '' }, { h: 'Alojamiento' }, { h: 'Por alumno' }, { h: 'El motivo que pone debajo' }],
      rows: [
        ['1º', 'Hotel Santa Mónica Playa 3* (Salou)', '<span class="mono">134 €</span>', 'Cumple 4 de 5 · 1 por confirmar'],
        ['2º', 'Hotel Planas 3* (Salou)', '<span class="mono">173 €</span>', 'Cumple 4 de 6 · 2 por confirmar'],
        ['3º', '4R Hotels 3* – Salou &amp; Calafell', '<span class="mono">138 €</span>', 'Cumple 4 de 7 · 3 por confirmar'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Por qué el primero no es el más barato',
      p: [
        'El 4R sale a 138 € y el Planas a 173 €, y el Santa Mónica va delante de los dos a 134 €. Pero el orden no es el precio: es <b>cuántas de las cosas que pidió el colegio confirma el documento del hotel</b>. El Santa Mónica es el único de los tres cuya tarifa menciona los menús para alergias.',
        '<b>Al podio no sube nada que incumpla algo.</b> Un 2★ cuando pidieron 3★ puede encajar perfecto en destino y fechas y puntuar altísimo; recomendarlo es hacerte perder el tiempo. Por eso el podio puede tener tres, dos, uno o ninguno.',
        'Cada tarjeta lleva su motivo escrito. Un puesto sin motivo es una opinión; con el motivo, se puede discutir.',
      ],
    },
    {
      t: 'tabla', cap: 'Y comprueba que el podio se comporta',
      tick: 'p3b',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Pulsar una tarjeta del podio', 'Se marca como opción, igual que en la lista. El texto pasa a «Quitar de las opciones».'],
        ['Buscar sin tope y sin requisitos', 'El podio <b>desaparece</b>. Sin nada que comprobar, destacar tres hoteles sería un adorno sin motivo.'],
        ['Mirar la lista larga de abajo', 'Los tres del podio salen también ahí, con la etiqueta <code>recomendado</code>, para que no parezcan dos búsquedas distintas.'],
      ],
    },
  ],
}

const LISTA = {
  id: 'lista', icono: 'lista', grupo: 'El recorrido', label: '4 · La lista',
  h2: 'Las filas, compactas y con el encaje a la vista',
  lede:
    '«Los bloques no están bien estructurados» y las tarjetas eran demasiado grandes. Ahora cada fila cabe de un vistazo y lleva debajo lo que cumple y lo que no.',
  blocks: [
    {
      t: 'tabla', tick: 'p4',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Mirar una fila', 'Nombre, categoría, régimen y pueblo en una línea; el precio <b>por alumno</b> a la derecha; y debajo la tira de comprobaciones.'],
        ['Leer la tira', '<code>✓ 3 estrellas</code> · <code>✓ Pensión completa</code> · <code>✓ 134 € por alumno</code> · <code>— Habitación adaptada</code>. Si hay más de cuatro, sale <code>+3</code> al final.'],
        ['Pasar el ratón por una marca', 'Sale el porqué: «Su tope era 300 €», «Su tarifa no dice nada».'],
        ['Mirar el sello del tope', '<code>cabe</code> en verde si entra en los 300 €; <code>+55 €</code> en ámbar si se pasa, diciendo cuánto.'],
        ['Buscar <code>Cambrils</code> en el destino', 'Salen <span class="mono">17</span>, de los cuales <span class="mono">9</span> llevan la etiqueta <code>cerca</code>: están a diez minutos y muchas veces son la mejor opción, pero hay que decirlo.'],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'El guion NO es una cruz',
      p: [
        '<code>✓</code> es cumple. <code>✗</code> en rojo es que el documento del hotel dice algo que lo contradice. <code>—</code> en gris es <b>que su documento no habla del tema</b>.',
        'Mezclarlos sería mentir: un hotel puede tener habitación adaptada y no haberlo escrito en su tarifa, y decirle a un colegio que lleva una alumna en silla de ruedas que ese hotel «no la tiene» es contestarle mal.',
      ],
    },
  ],
}

const DETALLE = {
  id: 'detalle', icono: 'base', grupo: 'El recorrido', label: '5 · El detalle',
  h2: 'Qué estás seleccionando exactamente',
  lede:
    '«Si le doy en detalles me muestra un pop up muy pequeño… no me da la seguridad de que estoy seleccionando un alojamiento con las características y necesidades de la petición». Ya no es un popover de 330 px: se despliega dentro de la fila, a todo el ancho.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Pulsa «Ver todo el detalle» en el Hotel Santa Mónica Playa.' },
    {
      t: 'tabla', tick: 'p5',
      cols: [{ h: 'Bloque' }, { h: 'Qué tiene que traer' }],
      rows: [
        [
          '<b>Esto es lo que vas a reservar</b>',
          'Estancia (4 noches, 12 may → 16 may 2027), grupo (48 alumnos · 4 profesores), régimen, habitación, temporada, estancia mínima.',
        ],
        [
          'El desglose del precio',
          'Alumnos: precio × 48 × 4 noches. Profesores: su línea, diciendo si es <b>uso individual</b> o <b>«sin tarifa individual: mismo precio»</b>. Y el <b>total del alojamiento</b>. Es el mismo cálculo que después sale en el PDF.',
        ],
        [
          '<b>Lo que pidió el centro</b>',
          'La lista entera, con el porqué de cada línea, no solo la tira corta de la fila.',
        ],
        [
          '<b>Lo que tiene este hotel para estas fechas</b>',
          'Tabla de tarifas con la seleccionada marcada. En el Santa Mónica salen <span class="mono">6</span>: la elegida y <span class="mono">5</span> más.',
        ],
        [
          'Gratuidades, condiciones y observaciones',
          'Enteras, en listas, no amontonadas en un párrafo. Y al pie, de qué documento salió.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Dos cosas de la tabla de tarifas',
      p: [
        '<b>Solo salen las que valen para las fechas del viaje.</b> El Santa Mónica tiene 42 tarifas cargadas; para el 12-16 de mayo valen 6. Enseñar las 42 no es enseñar alternativas: es invitar a elegir un precio de octubre para un viaje de mayo.',
        '<b>No se pueden elegir</b>, y lo dice. Se enseñan para saber qué más tiene el hotel; la búsqueda elige la marcada por lo que pidió el centro.',
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'El aviso ámbar: tarifas que no se distinguen',
      p: [
        'En algunos hoteles verás un aviso en ámbar. Es real y conviene entenderlo: el Santa Mónica tiene <b>media pensión a 28,75 €, a 43,12 € y a 51,75 € para las mismas fechas</b>, y en el catálogo no hay <b>nada</b> que diga en qué se diferencian: el campo de habitación está vacío en las 42.',
        'El documento sí lo distinguía —habitación, edificio, lo que sea— y el importador no lo guardó. Hasta recuperarlo, dejar elegir tarifa sería dejar elegir a ciegas.',
      ],
    },
  ],
}

const ACTIVIDADES = {
  id: 'actividades', icono: 'libro', grupo: 'El recorrido', label: '6 · Actividades',
  h2: 'Las actividades aparecen',
  lede:
    'En el servidor, buscar Salou devuelve CERO actividades teniendo 402 tarifas publicadas. En local salen.',
  blocks: [
    { t: 'sec', h3: 'Qué hacer', note: 'Pestaña «Actividades», cambiando el destino de la petición.' },
    {
      t: 'tabla', tick: 'p6',
      cols: [{ h: 'Destino' }, { h: 'Alojamientos' }, { h: 'Actividades' }, { h: '' }],
      rows: [
        ['Salou', '<span class="mono">19</span>', '<span class="mono">19</span>', ''],
        ['Vila-seca', '<span class="mono">16</span>', '<span class="mono">19</span>', ''],
        ['Cambrils', '<span class="mono">17</span>', '<span class="mono">11</span>', ''],
        ['Jaca', '<span class="mono">3</span>', '<span class="mono">0</span>', 'Correcto: es otra comarca'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Qué estaba pasando',
      p: [
        'Una actividad tiene <b>dos sitios distintos</b> y la app solo guardaba uno: dónde ocurre —«PortAventura Park»— y en qué pueblo está —Vila-seca o Salou—.',
        'Ocho actividades tenían el nombre del parque y las otras doce no tenían nada. Ninguna de las dos formas aparece buscando por localidad, que es lo único que escribe un colegio.',
      ],
    },
    {
      t: 'tabla', cap: 'Y el programa por opción',
      tick: 'p6b',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Marcar dos o tres actividades', 'Entran en el programa base, que va en las tres opciones.'],
        ['Volver a Alojamientos y pulsar «Comparar»', 'Las opciones en columnas, y se puede quitar o añadir una actividad en una sola de ellas.'],
        ['Mirar una fila con el programa cambiado', 'Debajo pone qué se ha quitado y qué se ha añadido respecto a la base.'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- la mesa */

const BORRADORES = {
  id: 'borradores', icono: 'reloj', grupo: 'El recorrido', label: '7 · Borradores',
  h2: 'Los borradores, que es lo que pidió Ruth',
  lede:
    'Sus puntos 4 y 5 eran la misma causa: el borrador vivía en el navegador bajo UNA sola clave. Esta parada es la que hay que probar con más calma.',
  blocks: [
    {
      t: 'tabla', tick: 'p7',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        [
          'Sal del lienzo con «Salir» y vuelve a entrar en «Nueva solicitud»',
          'Arriba, una lista de <b>solicitudes a medias</b> con su título compuesto: centro, destino y fecha.',
        ],
        [
          'Pulsar una de la lista',
          'Se recupera entera: los mensajes, los campos corregidos a mano, los hoteles marcados <b>y el hilo del chat</b>. Y vuelve a buscar, porque las tarifas pueden haber cambiado.',
        ],
        [
          'Mirar el chat recuperado',
          '<b>Están las preguntas y las respuestas</b>, y no vuelve a preguntar lo que ya se contestó. Sin esto, retomarlo mañana empezaba otra vez.',
        ],
        [
          'Empezar OTRA solicitud distinta',
          '<b>La anterior no se pierde.</b> Este era el fallo: solo había un borrador y empezar otro pisaba el anterior.',
        ],
        ['Volver a la lista', 'Están las dos.'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Dos decisiones que conviene que veas',
      p: [
        '<b>La visibilidad es más abierta que la de las propuestas, a propósito.</b> Un cotizador ve los borradores de su departamento, no solo los suyos. Lo pidió Ruth: si quien lo empezó está de baja, su compañera tiene que poder continuarlo.',
        '<b>No hay cerrojo duro.</b> Si otra persona lo tiene abierto se avisa de quién es y se puede tomar igualmente. Un cerrojo de verdad convierte unas vacaciones en un bloqueo. La reserva caduca a los 30 minutos.',
      ],
    },
  ],
}

const MESA = {
  id: 'mesa', icono: 'usuarios', grupo: 'El recorrido', label: '8 · La mesa',
  h2: 'La ficha, el correo y el borrado',
  lede:
    'Tres pantallas nuevas que cuelgan de la lista de presupuestos de la pantalla principal. No estaban en el recorrido anterior.',
  blocks: [
    {
      t: 'tabla', tick: 'p8',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        [
          '<b>Pulsar el título</b> de un presupuesto de la lista',
          'Se abre su <b>ficha</b> a pantalla completa: el viaje, el contacto, la oportunidad del CRM con su fase actual, las opciones enviadas, el correo y el PDF. La oportunidad contiene el presupuesto y el presupuesto alimenta la oportunidad; por eso conviven en la misma ficha.',
        ],
        [
          'Si Zoho no contesta',
          'La ficha <b>se abre igual</b>, diciendo que no ha podido leer el CRM. Lo nuestro no depende de que el CRM esté disponible.',
        ],
        [
          'Pulsar <b>«Correo»</b>',
          'La conversación con ese colegio: lo enviado y lo recibido, en hilo. Y un cuadro para escribirle.',
        ],
        [
          'Pulsar <b>«Ha cambiado algo»</b>',
          'Para cuando el cliente cambia fechas o número de alumnos.',
        ],
        [
          'Pulsar <b>«Borrar»</b> en una solicitud de prueba',
          'Dice exactamente qué se va a borrar —la solicitud, sus propuestas y <b>su oportunidad del CRM</b>— y pide confirmar.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'El borrado toca el CRM REAL',
      p: [
        'Borra primero en Zoho y después aquí. Si Zoho falla, <b>no borra nada</b>: quedarse con el trato huérfano en el CRM y sin el registro aquí es peor que no borrar.',
        'Y hay una regla que no se salta: <b>una propuesta que el colegio ya ha abierto no se borra.</b> Si tiene visitas o está enviada, dice por qué no puede.',
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Lo del correo, sin clave de buzón',
      p: ['En local no hay credenciales de correo, así que el envío sale <b>simulado</b>: dice «preparada, no ha salido». Eso no es un error.'],
    },
  ],
}

const CIERRE = {
  id: 'cierre', icono: 'escudo', grupo: 'El recorrido', label: '9 · Cerrar',
  h2: 'Hasta dónde llegar en local',
  lede: 'Aquí hay que parar antes del final, y conviene saber por qué.',
  blocks: [
    {
      t: 'nota', tone: 'no', kicker: 'En local, el CRM es el REAL de Oravia',
      p: [
        'Las credenciales de Zoho de la copia local son las de producción. Pulsar «Revisar y enviar» <b>crea una oportunidad de verdad</b> en su CRM.',
        'Así que: o paras antes de ese botón, o le pones al viaje un nombre con <code>PRUEBA</code> delante y lo borras después —ahora se puede, desde la propia app—.',
      ],
    },
    {
      t: 'tabla', tick: 'p9',
      cols: [{ h: 'Qué hacer' }, { h: 'Qué tiene que pasar' }],
      rows: [
        ['Si decides seguir: poner <code>PRUEBA</code> en el nombre del viaje', 'Para poder encontrarlo en Zoho y borrarlo.'],
        ['Pulsar «Revisar y enviar»', 'Aparece la referencia <code>ORV-2026-####</code> y la pantalla de revisión.'],
        ['Descargar el PDF', 'Tres partes: <b>1 · Los alojamientos</b>, <b>2 · Las actividades</b> y <b>3 · Resumen del viaje</b>. Sin páginas en blanco.'],
        ['Mirar la parte 1', 'Cada alojamiento con sus <b>políticas, gratuidades y condiciones</b> en líneas legibles, no con etiquetas técnicas.'],
        ['Mirar la parte 2', 'Las actividades con el total por alumno <b>y</b> para el grupo.'],
        ['Leer las observaciones', 'No puede aparecer «precios netos (coste)» ni el nombre de ningún fichero interno.'],
        ['Volver a la mesa y borrar la prueba', 'Se va de aquí y del CRM.'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- extras */

const CATALOGO = {
  id: 'catalogo', icono: 'alerta', grupo: 'Si te queda tiempo', label: 'El catálogo',
  h2: 'Por qué salen tantos guiones',
  lede:
    'Si al mirar el encaje te parece que hay demasiados «no consta», no es el motor: es lo que el catálogo tiene publicado. Estos números son de la copia local, hoy.',
  blocks: [
    {
      t: 'stats',
      items: [
        { v: '2', k: 'de 34 hablan de dietas', h: 'Santa Mónica y Trainera' },
        { v: '1', k: 'habla de accesibilidad', h: 'de 34' },
        { v: '5', k: 'sin nada publicado', h: 'ni condiciones ni gratuidades' },
      ],
    },
    {
      t: 'tabla', cap: 'Los cinco sin nada',
      tick: 'cat',
      cols: [{ h: 'Alojamiento' }, { h: '' }],
      rows: [
        ['CAMBRILS PARK-FUTBOL SALOU', ''],
        ['Mediterrània MED1', ''],
        ['Mediterrània MED2/3', ''],
        ['Villa Bonita / Aloha', ''],
        ['PortAventura · Entradas grupos parques 2027', '<b>Además no tiene ninguna tarifa.</b> Es un registro de entradas que quedó como si fuera un alojamiento. No sale en las búsquedas, pero no debería estar ahí.'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Lo que hay que hacer con esto',
      p: [
        'Los 34 alojamientos se publicaron el 22/09, <b>antes</b> de arreglar el extractor de textos. El motor que reparte gratuidades, condiciones y observaciones ya está corregido y probado, pero lo publicado sigue siendo lo viejo.',
        'La app <b>ya no guarda el fichero original</b> de esos cuatro documentos, así que no se pueden reprocesar: hay que <b>volver a subirlos</b>. Republicar ya es seguro: el borrado en cascada que se llevaba por delante las opciones de las propuestas está arreglado.',
        'Cuando preparéis la versión actualizada, lo que más peso tiene para que dejen de salir guiones es que el documento traiga, por hotel: <b>qué habitación es cada precio</b>, gratuidades, cancelación y depósito, tasas, y si hay menús para alergias y habitación adaptada.',
      ],
    },
  ],
}

const QUEDA = {
  id: 'queda', icono: 'bombilla', grupo: 'Si te queda tiempo', label: 'Qué falta',
  h2: 'Lo que NO se puede probar en local, y lo que sé que falla',
  lede: 'Para que no pierdas tiempo buscándolo.',
  blocks: [
    { t: 'sec', h3: 'No se puede probar aquí' },
    {
      t: 'rules',
      items: [
        { no: true, t: 'El envío de correo de verdad', d: 'En local no hay clave de buzón: sale simulado.' },
        { no: true, t: 'La bandeja de entrada', d: 'Bloqueada en el servidor: <code>groups@oraviatravel.com</code> acepta el correo y no aparece en ninguna carpeta.' },
        { no: true, t: 'Los idiomas', d: 'Catalán, inglés y francés siguen sin leerse.' },
        { no: true, t: 'La página pública', d: 'Funciona, pero el enlace apunta a localhost.' },
        { t: 'Las cifras exactas del catálogo', d: 'El espejo agrupa algunas tarifas de más. Para comparar números, el servidor.' },
      ],
    },
    { t: 'sec', h3: 'Y algo que he visto probando esto' },
    {
      t: 'nota', tone: 'no', kicker: 'El pueblo del colegio se lee como destino',
      p: [
        'Si el correo dice <code>del IES Jaume Balmes <b>de Barcelona</b></code> y <b>no</b> dice a dónde van, la app se queda con <b>Barcelona</b> como destino. Entonces el chat no pregunta el destino —cree que lo tiene— y la búsqueda devuelve cero alojamientos.',
        'Solo pasa cuando el destino real no está escrito: si el correo dice «a Salou», gana Salou. Y devuelve cero, no una lista equivocada. Aun así hay que arreglarlo: decidme si lo meto.',
      ],
    },
    { t: 'sec', h3: 'Y lo más importante' },
    {
      t: 'principio',
      kicker: 'Nada de esto está en el servidor',
      texto: 'Todo lo que pruebes hoy en local sigue sin llegar a Oravia. El despliegue no corre desde el 23 de septiembre, y hay migraciones de base de datos pendientes. Lo que veas aquí, ellos no lo tienen.',
    },
  ],
}

export const PANELS = [
  ARRANQUE,
  CHAT,
  CONTESTAR,
  PODIO,
  LISTA,
  DETALLE,
  ACTIVIDADES,
  BORRADORES,
  MESA,
  CIERRE,
  CATALOGO,
  QUEDA,
]
