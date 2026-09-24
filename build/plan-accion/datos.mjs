// Contenido del PLAN DE ACCIÓN de la consola de Oravia.
//
// El diseño y el montaje viven en nd-doc.mjs, el lenguaje D.
// Aquí solo va el contenido, en bloques.
//
// Todo está comprobado el 24-25/09/2026 contra el servidor (195.20.235.4),
// contra su CRM real —1.000 oportunidades leídas—, contra los buzones de correo
// y contra los 52 correos del hilo con Javier y Ruth desde junio. No hay
// estimaciones: si algo no se pudo comprobar, se dice.

// Las etiquetas de estado, arriba: se usan dentro de los paneles de abajo y en
// JavaScript un `const` no existe antes de su línea.
const EN_SERVIDOR = '<span class="chip def">En el servidor</span>'
const SIN_DESPLEGAR = '<span class="chip dec">Hecho, sin subir</span>'
const PENDIENTE = '<span class="chip crit">Pendiente</span>'
const DECIDE = '<span class="chip blue">Decide Oravia</span>'
const RESUELTO = '<span class="chip def">Resuelto</span>'

export const META = {
  cliente: 'Oravia Travel Group',
  sub: 'Consola de operaciones · plan de acción',
  titulo: 'Lo que falta para dar la app por terminada',
  kicker: 'Neointec × Oravia Travel Group · 25 de septiembre de 2026',
  lede:
    'El despliegue funciona, el presupuesto sale como se acordó y la app acaba de enviar su primer correo de verdad. Lo que queda son tres frentes: terminar la instalación del servidor —que es nuestra, no del hosting—, cerrar el volcado al CRM, y montar la gestión del correo dentro de la app, que es el encargo de fondo desde junio. Cada punto dice quién lo hace y cómo saber que ha salido bien.',
  fuentes: [
    { b: '52 correos', s: 'el hilo con Javier y Ruth desde el 3 de junio' },
    { b: 'Dos reuniones', s: 'transcripciones del 17/06 y del 21/09' },
    { b: 'Servidor, CRM y buzones', s: 'verificados, no recordados' },
  ],
  pie: ['main 726461e', '195.20.235.4', 'Zoho CRM · 1.000 tratos'],
  sigla: 'OR',
  version: 'Plan de acción · v3',
  tags: ['CONSOLA DE OPERACIONES', 'ZOHO CRM', 'GESTIÓN DEL CORREO'],
  estado: { texto: 'Acompañamiento hasta el 21/10/2026' },
  hechos: [
    { icono: 'check', v: '1er correo', k: 'enviado y recibido, 24/09' },
    { icono: 'alerta', v: '5 bloqueantes', k: 'y tres son nuestros' },
    { icono: 'escudo', v: '217 pruebas', k: 'automáticas, en verde' },
  ],
}

/* ---------------------------------------------------------------- estado */

const ESTADO = {
  id: 'estado', icono: 'check', grupo: 'Dónde estamos', label: 'El estado real',
  h2: 'Qué funciona hoy',
  lede: 'Comprobado mirando lo que contesta el servidor, no si el panel de GitHub salió verde.',
  blocks: [
    {
      t: 'nota', tone: 'ok', kicker: 'El correo ya sale de la app',
      p: [
        'El 24/09 se envió la propuesta ORV-2026-0004 desde <code>groups@oraviatravel.com</code>, con su PDF adjunto, y llegó. La entrega quedó en <b>SENT</b>, no en «simulada».',
        'Las claves estaban en el correo de Javier del <b>10 de agosto</b>. Se pidieron, se enviaron, y se quedaron seis semanas sin usar: es el retraso más caro de todo el proyecto y conviene decirlo.',
      ],
    },
    { t: 'sec', h3: 'Lo cerrado hasta hoy', note: 'Todo en main. Lo posterior a ea22d71 todavía no está en el servidor.' },
    {
      t: 'tabla',
      cols: [{ h: 'Qué' }, { h: 'Quién lo señaló' }, { h: 'Estado' }],
      rows: [
        ['El presupuesto en tres partes, con todo el detalle del alojamiento', 'Reunión del 21/09', EN_SERVIDOR],
        ['Las actividades, que no llegaban nunca al documento', 'Neointec, revisando', EN_SERVIDOR],
        ['Borrar una solicitud y su oportunidad del CRM', 'Oravia', EN_SERVIDOR],
        ['Los borradores dejan de duplicarse en cada recarga', 'Neointec, revisando', EN_SERVIDOR],
        ['«Arbitraje» ya se puede ofrecer, poniéndole precio', 'Ruth, 15/09', EN_SERVIDOR],
        ['Cada uno ve lo de su departamento', 'Ruth, 15/09 punto 5', EN_SERVIDOR],
        ['La edad deja de ser obligatoria', 'Javier, 17/09', EN_SERVIDOR],
        ['El contacto se trae del CRM y deja de duplicarse', 'Javier y Ruth, 17/09', EN_SERVIDOR],
        ['La oportunidad del CRM se rellena por campos', 'Javier, 23/09', SIN_DESPLEGAR],
        ['El servidor dice qué revisión sirve', 'Neointec', SIN_DESPLEGAR],
        ['Envío de correo, probado de punta a punta', 'Acordado en junio', '<span class="chip dec">Probado en local</span>'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'El reloj',
      p: [
        'El acompañamiento propuesto el 17/09 va del <b>21 de septiembre al 21 de octubre</b>. Queda menos de un mes, y es el periodo en el que ellos usan la app en su operativa real y nos cuentan lo que aparece.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- bloqueantes */

const BLOQUEA = {
  id: 'bloquea', icono: 'alerta', grupo: 'Bloqueantes', label: 'Lo que nos para',
  h2: 'Cinco cosas, y tres son nuestras',
  lede:
    'Hasta hace dos días esta lista era casi toda de Oravia. Al leer los correos resultó que la mayoría eran nuestras.',
  blocks: [
    {
      t: 'nota', tone: 'no', kicker: 'El hosting ya dijo que la instalación es nuestra',
      p: [
        'El 22/09, por boca de Javier: «Neointec se ha encargado de instalar su aplicación… <b>ha de ser Neointec quien complete su instalación, certificados y servicios web</b>. Neointec dispone de usuario con privilegios de administrador».',
        'Y añaden: «Una vez terminen, que nos avisen para configurar y poner en marcha las copias de seguridad». Es decir, <b>no hay copias de seguridad todavía</b>, y están esperándonos a nosotros.',
      ],
    },
    {
      t: 'tabla', tick: 'bloq',
      cols: [{ h: 'Qué' }, { h: 'Quién' }, { h: 'Dónde exactamente' }],
      rows: [
        [
          'Certificado y HTTPS',
          'Neointec',
          'El registro A ya existe pero apunta a <code>192.20.235.4</code> y el servidor es <code>195.20.235.4</code>: un dígito. Corregido eso, <code>certbot</code> ya está instalado: <code>sudo certbot --nginx -d presupuesto.oraviatravel.com</code>, y después <code>PUBLIC_BASE_URL</code> en el <code>.env</code>.',
        ],
        [
          'Las nueve variables de correo en el servidor',
          'Neointec',
          'En local ya están y funcionan. Mientras no se copien, producción sigue simulando y ningún colegio recibe nada.',
        ],
        [
          'Dos valores mal en el <code>.env</code> del servidor',
          'Neointec',
          '<code>ZOHO_DEAL_STAGE="Preparando Presupuesto"</code> —hoy dice «Nueva», que no es una de sus fases— y <code>ZOHO_DEAL_OPTIONS_FIELD="Opciones_de_Presupuesto"</code>.',
        ],
        [
          'Permiso de Zoho para Productos y Proveedores',
          'Oravia',
          'Hoy da <code>OAUTH_SCOPE_MISMATCH</code>. Sin eso el subformulario de servicios no se puede rellenar aunque se programe.',
        ],
        [
          'Añadir «Catalán» al campo Idioma',
          'Oravia',
          'Configuración → Personalización → Módulos y campos. Está en <b>tres módulos</b>: Oportunidades, Contactos y Cuentas.',
        ],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- el correo */

const CORREO = {
  id: 'correo', icono: 'base', grupo: 'Aplicar', label: 'La gestión del correo',
  h2: 'El encargo de fondo, desde junio',
  lede:
    'No es una mejora suelta: es el problema que Ruth describió como «lo otro gordo que tengo». La app tiene que sustituir al correo, porque Zoho no puede.',
  blocks: [
    {
      t: 'principio',
      kicker: 'Lo que se acordó el 17 de junio',
      texto: 'Que toda la gestión se haga desde la app, y que la oportunidad quede como repositorio de información y automatizaciones.',
    },
    { t: 'sec', h3: 'Por qué no sirve apoyarse en Zoho', note: 'Confirmado por su soporte y sufrido por ellos durante meses.' },
    {
      t: 'rules',
      items: [
        {
          no: true,
          t: 'Zoho solo vincula un correo por cuenta, y solo si sale por IMAP',
          d: 'Confirmado por el soporte de Zoho. Por eso Oravia tuvo que poner a TODOS sus gestores bajo un único usuario, el de groups@: «todos mis gestores tienen que trabajar con un usuario».',
        },
        {
          no: true,
          t: 'Y aun así los correos se cuelgan de la oportunidad equivocada',
          d: 'Palabras de Ruth: «se vinculan a la última oportunidad que se creó. Primera. Depende del día es una cosa u otra». El campo «Gestor Oportunidad» de su CRM es el parche que inventaron para poder filtrar lo suyo.',
        },
        {
          t: 'Por eso lo hace la app, y el premio es deshacer el parche',
          d: 'Si el correo vive en la app, sus cinco gestores pueden volver a tener cada uno su usuario de Zoho en vez de compartir uno.',
        },
      ],
    },
    { t: 'sec', h3: 'Lo que ya funciona', note: 'Probado el 24/09 contra los buzones reales.' },
    {
      t: 'tabla',
      cols: [{ h: 'Servicio' }, { h: 'Servidor' }, { h: 'Comprobado' }],
      rows: [
        ['Salida (SMTP)', '<code>smtp.servidor-correo.net:587</code> · STARTTLS', 'Propuesta enviada y recibida'],
        ['Entrada (IMAP)', '<code>imap.servidor-correo.net:993</code> · SSL/TLS', 'Los dos buzones dejan leer el INBOX'],
      ],
    },
    {
      t: 'nota', tone: 'q', kicker: 'Tres cosas que salieron al probarlo',
      p: [
        'No es Zoho Mail: es el proveedor de Oravia, y por el 587 con STARTTLS. La app venía apuntando a <code>smtp.zoho.eu:465</code>, así que también hubo que cambiar el modo de cifrado.',
        'Las claves <b>solo valen con <code>@oraviatravel.com</code></b>. Los buzones de <code>viajesvelero.com</code> ya están muertos: devuelven «authentication failed».',
        'Y los dos INBOX están <b>vacíos</b>. O son buzones recién estrenados, o el equipo trabaja desde otra carpeta. Hay que preguntarlo antes de montar la lectura, porque cambia dónde mira la app.',
      ],
    },
    { t: 'sec', h3: 'Lo que falta construir', note: 'Por orden: cada uno se apoya en el anterior.' },
    {
      t: 'tabla', tick: 'correo',
      cols: [{ h: 'Qué' }, { h: 'Para qué' }],
      rows: [
        [
          'Leer los buzones y guardar los mensajes',
          'Es la base. El <code>reply-to</code> por expediente ya existe a medias: genera <code>groups+ORV-2026-0184@dominio</code>, que es una marca infalsificable para saber de qué viaje habla cada respuesta.',
        ],
        [
          'Enseñar el hilo dentro de la propuesta',
          'Lo pidió Ruth con estas palabras: «¿tendríamos que verla por el mail sí o sí? La aplicación no te puede decir: cling, tienes aquí un mensaje de esta oportunidad».',
        ],
        [
          'Escribir al contacto desde la propuesta',
          '«Que ponga enviar email al contacto de la oportunidad». La respuesta en la reunión fue: «ese es el objetivo».',
        ],
        [
          'Avisar de que hay respuesta',
          'El motor de notificaciones está puesto en la app pero sin conectar. Es lo que convierte la bandeja en algo que no hay que ir a mirar.',
        ],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- recorrido */

const RECORRIDO = {
  id: 'recorrido', icono: 'flecha', grupo: 'Aplicar', label: 'El recorrido',
  h2: 'Qué falla en cada punto del camino',
  lede: 'Ordenado como lo recorre quien cotiza: llega el mensaje, se montan las opciones, sale el documento.',
  blocks: [
    { t: 'sec', h3: 'Paso 1 · La petición', note: 'Donde se pega el correo del colegio y la app lo entiende.' },
    {
      t: 'nota', tone: 'no', kicker: 'Un correo en catalán no saca ningún dato',
      p: [
        'Falló delante del cliente en la reunión del 21: hubo que traducirlo a mano, en directo, para poder seguir.',
        'Decidido: <b>lo traduce la IA con un modelo barato</b> y a partir de ahí lo lee el mismo sistema que ya funciona en castellano. Y el presupuesto sale en el idioma en que llegó la solicitud, condiciones de hotel incluidas.',
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

    { t: 'sec', h3: 'Paso 2 · Las opciones', note: 'Donde se eligen los alojamientos y el programa.' },
    {
      t: 'tabla', tick: 'p2',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'De dónde sale' }],
      rows: [
        [
          'La búsqueda por localidad no filtra',
          'Ruth, 15/09 punto 1: «ponemos localidad Cambrils y nos salen todos los hoteles a elegir».',
        ],
        [
          'Recolocar las actividades que no tienen municipio',
          'El catálogo guarda el nombre del parque donde debería ir el pueblo, así que no aparecen al buscar.',
        ],
        [
          'Poner localidad Salou a los dos hoteles California',
          'Están sin localidad y no salen buscando su propio destino.',
        ],
        [
          'Deduplicar los suplementos de un mismo alojamiento',
          'Sale repetido tantas veces como filas traía el documento de origen.',
        ],
        [
          'Explicar qué es «Tope por alumno»',
          'Ruth, 15/09 punto 4: «no sabemos qué significa». Si el nombre no se entiende, el nombre está mal.',
        ],
      ],
    },

    { t: 'sec', h3: 'Paso 3 · El documento y el envío', note: 'Reestructurado. Queda el idioma y una comprobación.' },
    {
      t: 'tabla', tick: 'p3',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Quién' }],
      rows: [
        ['Generar el PDF en el idioma de la solicitud', 'Neointec'],
        ['Probar el borrado contra una oportunidad real del CRM', 'Neointec'],
        ['Borrar los dos tratos de prueba que quedan vivos en su CRM', 'Neointec'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- producto */

const PRODUCTO = {
  id: 'producto', icono: 'capas', grupo: 'Aplicar', label: 'Producto y tarifas',
  h2: 'Reglas de negocio que están en los correos y no en la app',
  lede:
    'Salieron al releer el hilo de julio y agosto. Ninguna está implementada, y las tres primeras cambian lo que se cobra.',
  blocks: [
    {
      t: 'rules',
      items: [
        {
          no: true,
          t: 'Falta un tercer tipo de cliente',
          d: 'PortAventura, 14/08: «Cliente genérico PVP − 14%, Cliente especial PVP − 17%. El coste para ambas es PVP − 20%». La app solo conoce genérico y turoperador suizo: «especial» no existe.',
        },
        {
          no: true,
          t: 'Hay productos que son dos líneas, no una',
          d: 'Cambrils Park, 13/08: «una línea de alojamiento con proveedor Cambrils Park y otra con Entrenamiento paquete 1 hora y 30 con proveedor MARSOPA. Cada vez que hagamos una cotización tienen que salir ambas líneas… un servicio siempre va asociado al otro». Son dos proveedores y dos facturas. Es exactamente lo que pide el subformulario del CRM.',
        },
        {
          no: true,
          t: 'Fútbol Salou se cotiza según quién sea el cliente',
          d: '20/07: la compra es «FS 2027» y la venta «Destination – Travelclub» o «CLIENTE MSH GENÉRICO». Hay que preguntar si es un turoperador suizo u otro cliente para saber cuál coger. Javier avisó de que el paquete se separará en dos tarifas más adelante.',
        },
        {
          t: 'La regla del 8% sí está bien entendida',
          d: '10/08: se pasa el coste y la app calcula la venta sumando el 8%; si un producto no lleva ese margen, su venta va en una columna al lado y entonces manda esa. Así el día que cambie el margen no hay que volver a subir ningún documento.',
        },
      ],
    },
    { t: 'sec', h3: 'Y dos dudas suyas sin contestar', note: 'De los correos del 15 de septiembre.' },
    {
      t: 'tabla', tick: 'prod',
      cols: [{ h: 'Lo que preguntó Ruth' }, { h: 'Estado' }],
      rows: [
        ['Las tarifas 4R: «coste +8%» frente a «Venta (cualquier cliente)», ¿cuál es la diferencia? ¿elimino la que cargué yo?', PENDIENTE],
        ['«Tarifas Fútbol Salou 2027» pone «pendiente de revisar»: ¿a qué se refiere?', PENDIENTE],
        ['Borrar el alojamiento de prueba <code>ESTIDIANTES 4R27 3E</code>', '<span class="chip blue">Lo hacen ellos</span>'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- el CRM */

const CRM = {
  id: 'crm', icono: 'lista', grupo: 'Aplicar', label: 'El volcado al CRM',
  h2: 'La oportunidad ya no nace vacía',
  lede: 'Lo reportó Javier el 24/09 y tenía razón: mandábamos seis cosas y el resto se quedaba dentro de un texto.',
  blocks: [
    {
      t: 'nota', tone: 'q', kicker: 'Cómo se decidió qué escribir en cada campo',
      p: [
        'Leyendo sus 1.000 oportunidades y mirando qué rellenan ellos a mano: Departamento e Idioma en el 99%, Forma de Cobro en el 97%, Número de personas en el 96%, fecha de llegada en el 93%.',
        'Y con <b>sus</b> valores: «Grupos» y «Turismo Deportivo», que son 542 y 427 de sus tratos; «Deposito 30%» sin tilde, que es como está escrito en su lista y lo que llevan 735. Un valor inventado deja el campo vacío o tumba el registro entero.',
      ],
    },
    {
      t: 'tabla',
      cols: [{ h: 'Campo de su CRM' }, { h: 'De dónde sale' }],
      rows: [
        ['Fecha llegada y Fecha salida', 'Las fechas de la solicitud'],
        ['Número de personas · Profesores', 'Participantes y profesores, separados'],
        ['Departamento', 'Groups → «Grupos», Sports → «Turismo Deportivo», desde la sesión'],
        ['Idioma · Edad participantes · Contacto responsable', 'La solicitud y el contacto'],
        ['Forma de Cobro · Importe Depósito', '«Deposito 30%» y el 30% del importe'],
        ['Opciones de Presupuesto', 'El detalle de las tres opciones, que antes iba a la Descripción'],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'La duda de Javier sobre el subformulario, respondida',
      p: [
        '«Ya no recuerdo si lo cargará todo cuando se confirme el viaje o no». <b>No se carga nunca.</b>',
        'Servicios Contratados está vacío en las 1.000 oportunidades, en todas las fases: también en los 291 expedientes cerrados y en las 10 ganadas. Hoy no lo rellena nadie, ni la app ni una persona.',
        'Para que lo rellene la app hacen falta dos cosas: el permiso de Zoho sobre Productos y Proveedores, y resolver los productos de dos líneas —Cambrils Park y MARSOPA— porque son justo el caso que el subformulario tiene que reflejar.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- usuarios */

const USUARIOS = {
  id: 'usuarios', icono: 'escudo', grupo: 'Aplicar', label: 'Usuarios y permisos',
  h2: 'Quién entra y qué puede hacer',
  lede: 'Javier lo dejó escrito el 15 de julio y no se ha aplicado tal cual.',
  blocks: [
    {
      t: 'tabla', tick: 'usu',
      cols: [{ h: 'Quién' }, { h: 'Qué debe poder hacer' }],
      rows: [
        ['<code>groups@</code> y <code>sports@</code>', 'Cotizar, «pero que no les permita cambiar nada y que cada uno solo pueda ver sus cotizaciones»'],
        ['Javier y <code>agomez</code>', 'Administradores de todo'],
        ['<code>jfarre</code>', 'Administrador de Groups'],
        ['<code>rgarcia</code>', 'Administrador de Sports'],
      ],
    },
    {
      t: 'nota', tone: 'no', kicker: 'El administrador todavía se llama como la empresa antigua',
      p: [
        'Ruth lo pidió el 27 de agosto: «las credenciales de <code>admin@viajesvelero.com</code> deberían modificarse a algún dominio de <code>@oraviatravel.com</code>». Un mes después sigue igual.',
        'Y el 21/09 Javier pasó <b>los diez usuarios reales</b>, todos ya en <code>@oraviatravel.com</code>. Hay que darlos de alta con su departamento para que la regla de visibilidad haga algo.',
      ],
    },
  ],
}

/* ---------------------------------------------------------------- decisiones */

const DECISIONES = {
  id: 'decisiones', icono: 'bombilla', grupo: 'Vuestro turno', label: 'Decisiones',
  h2: 'Lo que falta decidir',
  lede: 'Las seis de la semana pasada están cerradas. Quedan estas.',
  blocks: [
    {
      t: 'principio',
      kicker: 'El fondo de la decisión del tipo de pago',
      texto: 'Un dato que nadie ha decidido todavía no se rellena: se pregunta cuando existe la respuesta.',
    },
    {
      t: 'nota', tone: 'q', kicker: 'Por qué no es «poner Prepago y ya»',
      p: [
        'Hoy la oportunidad nace <b>al enviar la propuesta</b>, cuando el colegio no ha elegido opción ni se ha pactado nada.',
        'En su CRM 878 de 1.000 son «Prepago» y 23 «Crédito». De esos 23, quince son ayuntamientos y diecisiete van con «Transferencia». Hay patrón, pero no regla: esos mismos ayuntamientos usan crédito 5 de 6 veces.',
      ],
    },
    {
      t: 'rules',
      items: [
        {
          t: 'Recomendada · preguntarlo cuando el colegio acepta',
          d: 'Aceptar es cuando arranca el reloj del depósito y cuando las condiciones de pago empiezan a importar. La app pregunta ahí, con «Prepago» propuesto y «Crédito» a un clic.',
        },
        {
          t: 'Alternativa · recordarlo por cliente',
          d: 'La primera vez se pregunta; después se propone lo que usó ese colegio la última vez. Más trabajo, y sigue necesitando la pregunta inicial.',
        },
        {
          no: true,
          t: 'Descartada · ponerlo siempre «Prepago»',
          d: 'Acierta el 90% y falla en silencio el otro 10%, que son las administraciones públicas: donde equivocarse cuesta más.',
        },
      ],
    },
    {
      t: 'tabla', tick: 'dec',
      cols: [{ h: 'Qué hay que decidir' }, { h: 'Estado' }],
      rows: [
        ['¿Se pregunta el tipo de pago al aceptar, como se propone arriba?', DECIDE],
        ['¿La forma de cobro es siempre depósito del 30%, o también se pacta?', DECIDE],
        ['¿Los buzones <code>groups@</code> y <code>sports@</code> están en uso? Los dos INBOX están vacíos', DECIDE],
        ['¿Qué es un «cliente especial», el del PVP − 17%?', DECIDE],
        ['El nombre de la oportunidad: centro + año', RESUELTO],
        ['Idiomas por IA con modelo barato', RESUELTO],
        ['El colegio ve las gratuidades y el precio por alumno', RESUELTO],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- próximos pasos */

const PROXIMOS = {
  id: 'proximos', icono: 'reloj', grupo: 'Vuestro turno', label: 'Próximos pasos',
  h2: 'Qué hace cada uno, y en qué orden',
  lede:
    'Los cinco primeros son de Neointec y ninguno depende de Oravia. El orden no es caprichoso: cada uno desbloquea al siguiente.',
  blocks: [
    {
      t: 'tabla', tick: 'next',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Quién' }, { h: 'Cómo saber que ha salido bien' }],
      rows: [
        [
          '<b>01</b>&nbsp; Corregir el registro A y sacar el certificado<br><span class="sec-note">Pedir a Oravia el dígito del DNS y después <code>sudo certbot --nginx -d presupuesto.oraviatravel.com</code>. Luego <code>PUBLIC_BASE_URL</code> en el <code>.env</code> y reiniciar.</span>',
          'Neointec',
          'La app abre por HTTPS y los enlaces de las propuestas llevan el dominio',
        ],
        [
          '<b>02</b>&nbsp; Pasar al servidor las variables de correo y las dos de Zoho<br><span class="sec-note">Las nueve <code>MAIL_*</code> que ya funcionan en local, más <code>ZOHO_DEAL_STAGE</code> y <code>ZOHO_DEAL_OPTIONS_FIELD</code>.</span>',
          'Neointec',
          'Una propuesta enviada desde el servidor llega, y el trato nace en «Preparando Presupuesto»',
        ],
        [
          '<b>03</b>&nbsp; Avisar al hosting para que monten las copias de seguridad<br><span class="sec-note">Lo están esperando desde el 22/09. Hoy el servidor no tiene copias.</span>',
          'Neointec → hosting',
          'El hosting confirma que las copias están activas',
        ],
        [
          '<b>04</b>&nbsp; Dar de alta los diez usuarios reales con sus permisos<br><span class="sec-note">Y renombrar el administrador a <code>@oraviatravel.com</code>, que Ruth pidió el 27/08.</span>',
          'Neointec',
          'Cada gestor entra con lo suyo y solo ve sus cotizaciones',
        ],
        [
          '<b>05</b>&nbsp; Limpiar los dos tratos de prueba del CRM<br><span class="sec-note">Con el botón de borrar nuevo, que de paso queda verificado contra Zoho.</span>',
          'Neointec',
          'No quedan oportunidades de prueba, y el borrado se lleva la del CRM',
        ],
        [
          '<b>06</b>&nbsp; Los idiomas: traducir con IA y sacar el PDF en el idioma de la solicitud<br><span class="sec-note">El bloque grande. Incluye traducir las condiciones de hotel que vienen en catalán.</span>',
          'Neointec',
          'Un correo en catalán saca todos los datos y su presupuesto sale en catalán',
        ],
        [
          '<b>07</b>&nbsp; La bandeja: leer los buzones y enseñar el hilo en la propuesta<br><span class="sec-note">Antes hay que saber si esos buzones se usan: los dos INBOX están vacíos.</span>',
          'Neointec',
          'Una respuesta del colegio aparece en su propuesta sin ir al correo',
        ],
        [
          '<b>08</b>&nbsp; Arreglar la búsqueda por localidad<br><span class="sec-note">Que Cambrils devuelva los de Cambrils, recolocar actividades sin municipio y deduplicar suplementos.</span>',
          'Neointec',
          'Buscando una localidad salen los que están en ella, y solo esos',
        ],
        [
          '<b>09</b>&nbsp; Las reglas de producto que faltan<br><span class="sec-note">El tercer tipo de cliente, los productos de dos líneas y Fútbol Salou según el cliente.</span>',
          'Neointec',
          'Una cotización de Cambrils Park saca las dos líneas con sus dos proveedores',
        ],
        [
          '<b>10</b>&nbsp; Autorizar Zoho con permiso de Productos y Proveedores<br><span class="sec-note">Hoy devuelve <code>OAUTH_SCOPE_MISMATCH</code> y ni se pueden leer.</span>',
          'Oravia',
          'La app puede listar Productos y Proveedores',
        ],
        [
          '<b>11</b>&nbsp; Añadir «Catalán» al campo Idioma de los tres módulos<br><span class="sec-note">Oportunidades, Contactos y Cuentas: son tres campos distintos con el mismo nombre.</span>',
          'Oravia',
          'Catalán aparece en la lista de los tres',
        ],
        [
          '<b>12</b>&nbsp; Contestar las cuatro decisiones abiertas<br><span class="sec-note">Tipo de pago, forma de cobro, si los buzones se usan y qué es un «cliente especial».</span>',
          'Oravia',
          'Hay respuesta y se puede programar',
        ],
      ],
    },
  ],
}

export const PANELS = [ESTADO, BLOQUEA, CORREO, RECORRIDO, PRODUCTO, CRM, USUARIOS, DECISIONES, PROXIMOS]
