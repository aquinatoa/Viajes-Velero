// Contenido del PLAN DE ACCIÓN de la consola de Oravia.
//
// El diseño y el montaje viven en nd-doc.mjs, el lenguaje D.
// Aquí solo va el contenido, en bloques.
//
// Todas las cifras están comprobadas el 24/09/2026 contra el servidor
// (195.20.235.4), contra su CRM real —1.000 oportunidades leídas— y contra la
// copia local. No hay estimaciones: si algo no se pudo comprobar, se dice.

// Las etiquetas de estado, arriba: se usan dentro de los paneles de abajo y en
// JavaScript un `const` no existe antes de su línea.
const EN_SERVIDOR = '<span class="chip def">En el servidor</span>'
const SIN_DESPLEGAR = '<span class="chip dec">Hecho, sin subir</span>'
const PENDIENTE = '<span class="chip crit">Pendiente</span>'
const DECIDE = '<span class="chip blue">Decide Oravia</span>'

export const META = {
  cliente: 'Oravia Travel Group',
  sub: 'Consola de operaciones · plan de acción',
  titulo: 'Qué hay que atender, en qué orden y qué bloquea a qué',
  kicker: 'Neointec × Oravia Travel Group · 24 de septiembre de 2026',
  lede:
    'El despliegue ya funciona y lo que quedaba atascado está en el servidor. Lo que sigue abierto es otra cosa: el recorrido de la app tiene puntos que todavía no hacen lo que debería, y el volcado al CRM dejaba la oportunidad casi vacía. Esto es todo lo que queda, ordenado por lo que desbloquea a lo demás.',
  fuentes: [
    { b: 'Correos de Ruth y Javier', s: 'incluido el del 24/09 sobre el volcado a Zoho' },
    { b: 'Su CRM real', s: '1.000 oportunidades leídas el 24/09' },
    { b: 'Servidor 195.20.235.4', s: 'verificado contra lo que contesta' },
  ],
  pie: [
    'main fc218ec',
    '195.20.235.4',
    'Zoho CRM · 1.000 tratos',
  ],
  sigla: 'OR',
  version: 'Plan de acción · v2',
  tags: ['CONSOLA DE OPERACIONES', 'ZOHO CRM', 'RECORRIDO DE LA APP'],
  // Propios del formato D: la píldora del rail y los tres datos de portada.
  estado: { texto: 'Desplegando · 24/09/2026' },
  hechos: [
    { icono: 'check', v: '6 bloques', k: 'corregidos esta semana' },
    { icono: 'alerta', v: '5 bloqueantes', k: 'que no puede resolver Neointec' },
    { icono: 'escudo', v: '217 pruebas', k: 'automáticas, en verde' },
  ],
}

/* ---------------------------------------------------------------- dónde estamos */

const ESTADO = {
  id: 'estado', icono: 'check', grupo: 'Dónde estamos', label: 'El estado real',
  h2: 'Qué funciona hoy y qué acaba de subir',
  lede:
    'Comprobado mirando lo que contesta el servidor, no si el panel de GitHub salió verde.',
  blocks: [
    {
      t: 'nota', tone: 'q', kicker: 'Cómo se comprueba un despliegue a partir de ahora',
      p: [
        'Saber si un cambio estaba en el servidor obligaba a buscar una frase concreta dentro del JavaScript minificado. Eso no es una forma de verificar nada.',
        'Ahora <code>/api/health</code> devuelve la revisión que está sirviendo. Comprobar un despliegue es comparar eso con el sha de <code>main</code>.',
      ],
    },
    { t: 'sec', h3: 'Lo corregido esta semana', note: 'Todo subido a main. Lo anterior a ea22d71 ya está en el servidor.' },
    {
      t: 'tabla',
      cols: [{ h: 'Qué' }, { h: 'Quién lo señaló' }, { h: 'Estado' }],
      rows: [
        ['El presupuesto en tres partes, con todo el detalle del alojamiento', 'La reunión del 21/09', EN_SERVIDOR],
        ['Las actividades, que no llegaban nunca al documento', 'Neointec, revisando', EN_SERVIDOR],
        ['Borrar una solicitud y su oportunidad del CRM', 'Oravia', EN_SERVIDOR],
        ['Los borradores dejan de duplicarse en cada recarga', 'Neointec, revisando', EN_SERVIDOR],
        ['«Arbitraje» ya se puede ofrecer, poniéndole precio', 'Oravia', EN_SERVIDOR],
        ['La oportunidad del CRM se rellena por campos', 'Ruth, 24/09', SIN_DESPLEGAR],
        ['El servidor dice qué revisión sirve', 'Neointec', SIN_DESPLEGAR],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- bloqueantes */

const BLOQUEA = {
  id: 'bloquea', icono: 'alerta', grupo: 'Bloqueantes', label: 'Lo que nos para',
  h2: 'Cinco cosas que no puede hacer Neointec',
  lede:
    'Ninguna lleva más de diez minutos, y entre las cinco desbloquean tres bloques de trabajo. Mientras no estén, lo que hay debajo no se puede ni empezar ni comprobar.',
  blocks: [
    {
      t: 'nota', tone: 'no', kicker: 'La más urgente: dos valores mal en el .env del servidor',
      p: [
        '<code>ZOHO_DEAL_STAGE=Nueva</code>, y «Nueva» <b>no es una de sus fases</b>. Siete oportunidades acabaron ahí, fuera del embudo, sin que nadie lo viera hasta leer el CRM entero.',
        '<code>ZOHO_DEAL_OPTIONS_FIELD=Description</code> manda el detalle del presupuesto a la Descripción, que es donde ellos escriben a mano. Su campo para esto es <code>Opciones_de_Presupuesto</code>, vacío en 998 de sus 1.000 tratos.',
        'El código ya se defiende —una fase que no existe se ignora con aviso—, pero el campo del detalle hay que cambiarlo en el servidor.',
      ],
    },
    {
      t: 'tabla', tick: 'bloq',
      cols: [{ h: 'Qué' }, { h: 'Quién' }, { h: 'Dónde exactamente' }],
      rows: [
        [
          'Corregir los dos valores del <code>.env</code>',
          'Neointec / Cristian',
          '<code>/opt/oravia/shared/.env</code> → <code>ZOHO_DEAL_STAGE="Preparando Presupuesto"</code> y <code>ZOHO_DEAL_OPTIONS_FIELD="Opciones_de_Presupuesto"</code>',
        ],
        [
          'Añadir «Catalán» al campo Idioma',
          'Oravia',
          'Configuración → Personalización → Módulos y campos → campo «Idioma». Está en <b>tres módulos</b>: Oportunidades, Contactos y Cuentas. Hay que añadirlo en los tres.',
        ],
        [
          'Volver a autorizar Zoho con permiso de Productos y Proveedores',
          'Oravia',
          'Hoy da <code>OAUTH_SCOPE_MISMATCH</code>. Sin eso no se puede rellenar el subformulario de servicios.',
        ],
        [
          'Corregir el registro A de <code>presupuesto.oraviatravel.com</code>',
          'Hosting',
          'Apunta a <code>192.20.235.4</code>; el servidor es <code>195.20.235.4</code>. Un dígito.',
        ],
        [
          'Sacar del limbo las 7 oportunidades en fase «Nueva»',
          'Oravia o Neointec',
          'Son de pruebas nuestras. Con el borrado nuevo se quitan desde la app.',
        ],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- el recorrido */

const RECORRIDO = {
  id: 'recorrido', icono: 'flecha', grupo: 'Aplicar', label: 'El recorrido',
  h2: 'Qué falla en cada punto del camino',
  lede:
    'Ordenado como lo recorre quien cotiza: llega el mensaje, se montan las opciones, sale el documento. En cada punto, lo que todavía no hace lo que debería.',
  blocks: [
    { t: 'sec', h3: 'Paso 1 · La petición', note: 'Donde se pega el correo del colegio y la app lo entiende.' },
    {
      t: 'nota', tone: 'no', kicker: 'Un correo en catalán no saca ningún dato',
      p: [
        'Falló delante del cliente en la reunión del 21: hubo que traducirlo a mano, en directo, para poder seguir.',
        'Decidido: <b>lo traduce la IA con un modelo barato</b>, y a partir de ahí lo lee el mismo sistema que ya funciona con los correos en castellano. Y el presupuesto se genera en el idioma en que llegó la solicitud.',
      ],
    },
    {
      t: 'tabla', tick: 'p1',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Quién' }],
      rows: [
        ['Traducir el mensaje con IA antes de leerlo', 'Neointec'],
        ['Guardar el idioma detectado en la solicitud y en el trato', 'Neointec'],
        ['Probarlo con correos reales en catalán, inglés y francés', 'Oravia + Neointec'],
      ],
    },

    { t: 'sec', h3: 'Paso 2 · Las opciones', note: 'Donde se eligen los tres alojamientos y el programa de actividades.' },
    {
      t: 'tabla', tick: 'p2',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Por qué' }],
      rows: [
        [
          'Recolocar las actividades que no tienen localidad',
          'No aparecen al buscar por pueblo: el catálogo guarda el nombre del parque donde debería ir el municipio.',
        ],
        [
          'Poner localidad Salou a los dos hoteles California',
          'Están sin localidad y no salen en la búsqueda de su propio destino.',
        ],
        [
          'Deduplicar los suplementos de un mismo alojamiento',
          'El mismo suplemento sale repetido tantas veces como filas traía el documento de origen.',
        ],
      ],
    },

    { t: 'sec', h3: 'Paso 3 · El documento y el envío', note: 'Ya reestructurado. Queda el idioma y una comprobación.' },
    {
      t: 'tabla', tick: 'p3',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Quién' }],
      rows: [
        ['Generar el PDF en el idioma de la solicitud', 'Neointec'],
        ['Traducir al idioma del documento las condiciones que vienen en catalán', 'Neointec'],
        ['Comprobar el borrado con una oportunidad real del CRM', 'Neointec + Oravia'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Lo único del borrado que no está verificado',
      p: [
        'El borrado se probó entero en local: la solicitud desaparece, sus PDF también y la auditoría queda escrita.',
        'Lo que <b>no</b> se ha probado contra el CRM real es que se lleve la oportunidad. Hay que hacerlo con una de prueba antes de que lo use nadie.',
      ],
    },

    { t: 'sec', h3: 'Después · El seguimiento', note: 'Lo que pasa cuando la propuesta ya está fuera.' },
    {
      t: 'tabla', tick: 'p4',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Estado' }],
      rows: [
        ['Ver los correos de cada oportunidad (punto 2 de Ruth)', PENDIENTE],
        ['Requiere el módulo de correo de Zoho, que no hemos tocado', PENDIENTE],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- el CRM */

const CRM = {
  id: 'crm', icono: 'base', grupo: 'Aplicar', label: 'El volcado al CRM',
  h2: 'La oportunidad ya no nace vacía',
  lede:
    'Lo reportó Ruth el 24/09 y tenía razón: mandábamos seis cosas y el resto se quedaba dentro de un texto. Los campos llevaban ahí desde siempre.',
  blocks: [
    {
      t: 'nota', tone: 'q', kicker: 'Cómo se decidió qué escribir en cada campo',
      p: [
        'Leyendo sus 1.000 oportunidades y mirando qué rellenan ellos a mano: Departamento e Idioma en el 99%, Forma de Cobro en el 97%, Número de personas en el 96%, fecha de llegada en el 93%.',
        'Y con <b>sus</b> valores, no los nuestros: «Grupos» y «Turismo Deportivo», que son 542 y 427 de sus tratos; «Deposito 30%» sin tilde, que es como está escrito en su lista y lo que llevan 735. Un valor inventado deja el campo vacío o tumba el registro entero.',
      ],
    },
    { t: 'sec', h3: 'Lo que ahora se rellena', note: 'Hecho, pendiente de desplegar.' },
    {
      t: 'tabla',
      cols: [{ h: 'Campo de su CRM' }, { h: 'De dónde sale' }],
      rows: [
        ['Fecha llegada / actividad', 'La fecha de entrada de la solicitud'],
        ['Fecha salida / actividad', 'La de salida, que además sigue siendo la fecha de cierre'],
        ['Número de personas', 'Los participantes'],
        ['Profesores / Entrenadores', 'Los profesores, aparte de los alumnos'],
        ['Departamento', 'Groups → «Grupos», Sports → «Turismo Deportivo», desde la sesión de quien cotiza'],
        ['Idioma', 'El de la solicitud, con el nombre de su lista'],
        ['Edad participantes', 'El rango tal como venía en el mensaje'],
        ['Contacto responsable grupo', 'El nombre del contacto, en texto'],
        ['Forma de Cobro', '«Deposito 30%», el acuerdo de junio'],
        ['Importe Depósito', 'El 30% del importe de la opción principal'],
        ['Opciones de Presupuesto', 'El detalle de las tres opciones, que antes iba a la Descripción'],
      ],
    },
    { t: 'sec', h3: 'Lo que NO se rellena, y por qué', note: 'Callarlo sería peor que dejarlo vacío.' },
    {
      t: 'tabla',
      cols: [{ h: 'Campo' }, { h: 'Por qué no' }],
      rows: [
        [
          'Tipo de pago',
          'Crédito o prepago se pacta con cada colegio y la app no lo sabe. Ver la propuesta en «Decisiones».',
        ],
        [
          'Idioma, cuando el correo viene en catalán',
          'Su lista solo tiene Español, Inglés y Francés. Preferimos el campo vacío a inventar un valor que su CRM no reconoce.',
        ],
        [
          'Servicios Contratados (el subformulario)',
          'Bloqueado: sus columnas Servicio y Proveedor apuntan a Productos y Proveedores, y nuestra autorización no tiene permiso para leerlos.',
        ],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'La duda de Ruth sobre el subformulario, respondida',
      p: [
        '«Ya no recuerdo si lo cargará todo cuando se confirme el viaje o no.» <b>No se carga nunca.</b>',
        'Servicios Contratados está vacío en las 1.000 oportunidades, en todas las fases: también en los 291 expedientes cerrados y en las 10 oportunidades ganadas. Hoy no lo rellena nadie, ni la app ni una persona.',
        'Si se quiere que la app sea la primera en llenarlo, hace falta el permiso de Zoho y saber si su catálogo de Productos tiene los hoteles y las actividades con los que casar los nuestros.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- decisiones */

const DECISIONES = {
  id: 'decisiones', icono: 'bombilla', grupo: 'Vuestro turno', label: 'Decisiones',
  h2: 'El tipo de pago: cuándo se pregunta y quién lo dice',
  lede:
    'Es la única decisión de fondo que queda abierta. Las demás ya están cerradas y aplicadas.',
  blocks: [
    {
      t: 'nota', tone: 'q', kicker: 'El problema no es qué valor poner, es cuándo',
      p: [
        'Hoy la oportunidad nace <b>al enviar la propuesta</b>, cuando el colegio todavía no ha elegido opción ni se ha pactado nada. Rellenar ahí el tipo de pago es adivinar.',
        'En su CRM, 878 de 1.000 son «Prepago» y 23 «Crédito». De esos 23, quince son ayuntamientos —Salou, Vila-seca, El Morell— y diecisiete van con «Transferencia» en la forma de cobro. Hay un patrón, pero no es una regla: esos mismos ayuntamientos usan crédito 5 de 6 veces, no 6 de 6.',
      ],
    },
    {
      t: 'principio',
      kicker: 'El fondo de la decisión',
      texto: 'Un dato que nadie ha decidido todavía no se rellena: se pregunta cuando existe la respuesta.',
    },
    { t: 'sec', h3: 'Tres formas de resolverlo', note: 'La primera es la recomendada.' },
    {
      t: 'rules',
      items: [
        {
          t: 'Recomendada · preguntarlo cuando el colegio acepta',
          d: 'Aceptar una opción es el momento en que arranca el reloj del depósito y en que las condiciones de pago empiezan a importar. La app pregunta ahí, con «Prepago» propuesto por defecto y «Crédito» a un clic. Un gesto, en el momento en que la respuesta existe.',
        },
        {
          t: 'Alternativa · recordarlo por cliente',
          d: 'La primera vez se pregunta; a partir de ahí se propone lo que se usó la última vez con ese colegio, leyéndolo de sus oportunidades anteriores. Es lo que hace un comercial de memoria. Más trabajo, y sigue necesitando la pregunta inicial.',
        },
        {
          no: true,
          t: 'Descartada · ponerlo siempre «Prepago»',
          d: 'Acertaria el 90% de las veces y fallaria en silencio el otro 10%, que son justo las administraciones publicas: los tratos donde equivocarse cuesta mas.',
        },
      ],
    },
    {
      t: 'tabla', tick: 'dec',
      cols: [{ h: 'Qué hay que decidir' }, { h: 'Quién' }, { h: 'Estado' }],
      rows: [
        ['¿Se pregunta al aceptar, como se propone arriba?', 'Oravia', DECIDE],
        ['¿La forma de cobro es siempre depósito del 30%, o también se pacta?', 'Oravia', DECIDE],
        ['El nombre de la oportunidad: centro + año', 'Oravia', '<span class="chip def">Respondido 24/09</span>'],
        ['Idiomas por IA con modelo barato', 'Oravia', '<span class="chip def">Respondido 24/09</span>'],
        ['El colegio ve las gratuidades del hotel', 'Oravia', '<span class="chip def">Sí, y ya sale</span>'],
        ['El precio por alumno va en el PDF', 'Oravia', '<span class="chip def">Sí, y ya sale</span>'],
        ['Abrir el enlace mueve a «Seguimiento al Presupuesto»', 'Oravia', '<span class="chip def">Sí, y ya funciona</span>'],
        ['Las condiciones en catalán se traducen', 'Oravia', '<span class="chip def">Sí, entra con los idiomas</span>'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- próximos pasos */

const PROXIMOS = {
  id: 'proximos', icono: 'lista', grupo: 'Vuestro turno', label: 'Próximos pasos',
  h2: 'Qué hace cada uno, y en qué orden',
  lede:
    'Los tres primeros no los puede hacer Neointec. El orden no es caprichoso: cada uno desbloquea al siguiente.',
  blocks: [
    {
      t: 'tabla', tick: 'next',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Quién' }, { h: 'Cómo saber que ha salido bien' }],
      rows: [
        [
          '<b>01</b>&nbsp; Corregir los dos valores del .env del servidor<br><span class="sec-note">En <code>/opt/oravia/shared/.env</code>: <code>ZOHO_DEAL_STAGE="Preparando Presupuesto"</code> y <code>ZOHO_DEAL_OPTIONS_FIELD="Opciones_de_Presupuesto"</code>. Después, reiniciar el servicio.</span>',
          'Neointec',
          'Una oportunidad nueva nace en «Preparando Presupuesto» y su detalle va a Opciones de Presupuesto',
        ],
        [
          '<b>02</b>&nbsp; Añadir «Catalán» al campo Idioma<br><span class="sec-note">Configuración → Personalización → Módulos y campos → campo «Idioma». En <b>Oportunidades, Contactos y Cuentas</b>: son tres campos distintos con el mismo nombre.</span>',
          'Oravia',
          'Catalán aparece en la lista de los tres módulos',
        ],
        [
          '<b>03</b>&nbsp; Volver a autorizar Zoho con permiso de Productos y Proveedores<br><span class="sec-note">Hoy la app no puede ni leerlos: devuelve <code>OAUTH_SCOPE_MISMATCH</code>. Sin esto, el subformulario de servicios no se puede rellenar aunque se programe.</span>',
          'Oravia',
          'La app puede listar Productos y Proveedores',
        ],
        [
          '<b>04</b>&nbsp; Probar el borrado contra una oportunidad real<br><span class="sec-note">Crear una solicitud de prueba con nombre reconocible y borrarla desde la mesa de propuestas. Comprobar que la oportunidad desaparece del CRM y aparece en su papelera.</span>',
          'Neointec',
          'La oportunidad ya no está en el embudo y sí en la papelera',
        ],
        [
          '<b>05</b>&nbsp; Decidir cuándo se pregunta el tipo de pago<br><span class="sec-note">Ver «Decisiones». La propuesta es preguntarlo al aceptar la opción, no al enviar la propuesta.</span>',
          'Oravia',
          'Hay respuesta, y se puede programar',
        ],
        [
          '<b>06</b>&nbsp; Los idiomas: traducir con IA y generar el PDF en el idioma de la solicitud<br><span class="sec-note">Es el bloque grande. Incluye traducir las condiciones de hotel que vienen en catalán.</span>',
          'Neointec',
          'Un correo en catalán saca todos los datos y su presupuesto sale en catalán',
        ],
        [
          '<b>07</b>&nbsp; Limpiar el catálogo<br><span class="sec-note">Borrar el alojamiento de prueba <code>ESTIDIANTES 4R27 3E</code> y decir qué precio lleva la tarifa «Arbitraje», que ya se puede ofrecer poniéndoselo a mano.</span>',
          'Oravia',
          'El catálogo no tiene filas de prueba',
        ],
        [
          '<b>08</b>&nbsp; Arreglar la búsqueda por localidad<br><span class="sec-note">Recolocar las actividades sin municipio, poner Salou a los dos hoteles California y deduplicar los suplementos repetidos.</span>',
          'Neointec',
          'Buscando Salou salen todos los que están en Salou',
        ],
      ],
    },
  ],
}

export const PANELS = [ESTADO, BLOQUEA, RECORRIDO, CRM, DECISIONES, PROXIMOS]
