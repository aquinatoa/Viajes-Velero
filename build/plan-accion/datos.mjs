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
        ['El borrado se lleva la oportunidad del CRM, verificado contra Zoho', 'Oravia', EN_SERVIDOR],
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
        ['Probar el borrado contra una oportunidad real del CRM', '<span class="chip def">Hecho el 25/09</span>'],
        ['Borrar los tratos de prueba que quedan sueltos en su CRM', 'Neointec'],
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
    'Separado por quién lo tiene que hacer. Lo de arriba son conversaciones: no se programa, se escribe, y desbloquea casi todo lo demás.',
  blocks: [
    {
      t: 'sec', h3: 'Tus tareas · Anthony',
      note: 'Hablar con Oravia y con el hosting. Ninguna lleva más de diez minutos y todas desbloquean trabajo.',
    },
    {
      t: 'tabla', tick: 'anthony',
      cols: [{ h: 'Qué hay que escribir' }, { h: 'A quién' }, { h: 'Qué desbloquea' }],
      rows: [
        [
          '<b>A1</b>&nbsp; El dígito del DNS<br><span class="sec-note">Redactado en <code>correo-dns-javier.md</code>. <code>presupuesto.oraviatravel.com</code> apunta a <code>192.20.235.4</code> y el servidor es <code>195.20.235.4</code>.</span>',
          'Javier',
          'El certificado y el paso a HTTPS',
        ],
        [
          '<b>A2</b>&nbsp; ¿Se usan los buzones <code>groups@</code> y <code>sports@</code>?<br><span class="sec-note">Los dos INBOX están vacíos. O son nuevos, o el equipo trabaja desde otra carpeta. Cambia dónde tiene que mirar la app.</span>',
          'Javier o Ruth',
          'Toda la bandeja de entrada',
        ],
        [
          '<b>A3</b>&nbsp; Pedir el permiso de Zoho sobre Productos y Proveedores<br><span class="sec-note">Hoy devuelve <code>OAUTH_SCOPE_MISMATCH</code> y ni se pueden leer. Hay que volver a autorizar la app.</span>',
          'Oravia',
          'El subformulario de Servicios Contratados',
        ],
        [
          '<b>A4</b>&nbsp; Pedir que añadan «Catalán» al campo Idioma<br><span class="sec-note">En los tres módulos: Oportunidades, Contactos y Cuentas. Son tres campos distintos con el mismo nombre.</span>',
          'Oravia',
          'Que un viaje en catalán no quede sin idioma en el CRM',
        ],
        [
          '<b>A5</b>&nbsp; Las cuatro decisiones abiertas<br><span class="sec-note">Tipo de pago, forma de cobro, y qué es un «cliente especial» (el del PVP − 17%). Ver la pestaña de Decisiones.</span>',
          'Javier y Ruth',
          'El tipo de pago y el tercer tipo de cliente',
        ],
        [
          '<b>A6</b>&nbsp; Contestar las dos dudas de Ruth del 15/09<br><span class="sec-note">Las tarifas 4R —«coste +8%» frente a «Venta»— y qué significa el «pendiente de revisar» de Fútbol Salou 2027. Llevan diez días sin respuesta.</span>',
          'Ruth',
          'Cerrar el catálogo de tarifas',
        ],
        [
          '<b>A7</b>&nbsp; Avisar al hosting para que monten las copias de seguridad<br><span class="sec-note">Lo piden desde el 22/09, cuando terminemos la instalación. Hoy el servidor no tiene copias.</span>',
          'Hosting',
          'Que un fallo del servidor deje de ser irreversible',
        ],
      ],
    },

    {
      t: 'sec', h3: 'Neointec',
      note: 'Trabajo técnico. Los tres primeros no dependen de nadie y se pueden hacer hoy.',
    },
    {
      t: 'tabla', tick: 'neo',
      cols: [{ h: 'Qué hay que hacer' }, { h: 'Cómo saber que ha salido bien' }],
      rows: [
        [
          '<b>N1</b>&nbsp; Pasar al servidor las variables de correo y las dos de Zoho<br><span class="sec-note">Las nueve <code>MAIL_*</code> que ya funcionan en local, más <code>ZOHO_DEAL_STAGE="Preparando Presupuesto"</code> y <code>ZOHO_DEAL_OPTIONS_FIELD="Opciones_de_Presupuesto"</code>.</span>',
          'Una propuesta enviada desde el servidor llega, y el trato nace en «Preparando Presupuesto»',
        ],
        [
          '<b>N2</b>&nbsp; Dar de alta los diez usuarios reales con sus permisos<br><span class="sec-note">Y renombrar el administrador a <code>@oraviatravel.com</code>, que Ruth pidió el 27/08.</span>',
          'Cada gestor entra con lo suyo y solo ve sus cotizaciones',
        ],
        [
          '<b>N3</b>&nbsp; Limpiar los tratos de prueba del CRM<br><span class="sec-note"><b>Hecho el 25/09</b> para los dos que tenían solicitud en la app: se borraron desde el botón nuevo y el trato desapareció del CRM. Quedan <b>dos huérfanos</b> —«Anthony Quinatoa · Salou, mayo de 2027» y «PRUEBA ORAVIA - COTIZADOR»— que no tienen solicitud detrás, así que la app no los alcanza: hay que borrarlos en Zoho.</span>',
          'No queda ninguna oportunidad de prueba en el embudo',
        ],
        [
          '<b>N4</b>&nbsp; Sacar el certificado y pasar la app a HTTPS<br><span class="sec-note">Cuando A1 esté hecho: <code>sudo certbot --nginx -d presupuesto.oraviatravel.com</code>, después <code>PUBLIC_BASE_URL</code> en el <code>.env</code> y reiniciar.</span>',
          'La app abre por HTTPS y los enlaces de las propuestas llevan el dominio',
        ],
        [
          '<b>N5</b>&nbsp; Los idiomas: traducir con IA y sacar el PDF en el idioma de la solicitud<br><span class="sec-note">El bloque grande. Incluye traducir las condiciones de hotel que vienen en catalán.</span>',
          'Un correo en catalán saca todos los datos y su presupuesto sale en catalán',
        ],
        [
          '<b>N6</b>&nbsp; Arreglar la búsqueda por localidad<br><span class="sec-note">Que Cambrils devuelva los de Cambrils, recolocar actividades sin municipio y deduplicar suplementos.</span>',
          'Buscando una localidad salen los que están en ella, y solo esos',
        ],
        [
          '<b>N7</b>&nbsp; Las reglas de producto que faltan<br><span class="sec-note">El tercer tipo de cliente, los productos de dos líneas y Fútbol Salou según el cliente. Depende de A5 y A6.</span>',
          'Una cotización de Cambrils Park saca las dos líneas con sus dos proveedores',
        ],
        [
          '<b>N8</b>&nbsp; La bandeja: leer los buzones y enseñar el hilo en la propuesta<br><span class="sec-note">Depende de A2. Después vienen escribir al contacto y el aviso de respuesta.</span>',
          'Una respuesta del colegio aparece en su propuesta sin ir al correo',
        ],
      ],
    },

    {
      t: 'sec', h3: 'Oravia',
      note: 'Lo que solo pueden hacer ellos, una vez se lo pidas.',
    },
    {
      t: 'tabla', tick: 'ora',
      cols: [{ h: 'Qué' }, { h: 'Se lo pide' }],
      rows: [
        ['Corregir el registro A del subdominio', 'A1'],
        ['Volver a autorizar Zoho con Productos y Proveedores', 'A3'],
        ['Añadir «Catalán» al campo Idioma de los tres módulos', 'A4'],
        ['Contestar las cuatro decisiones abiertas', 'A5'],
        ['Aclarar las tarifas 4R y el «pendiente de revisar» de Fútbol Salou', 'A6'],
        ['Borrar el alojamiento de prueba <code>ESTIDIANTES 4R27 3E</code>', 'Ya dijeron que lo hacen ellos'],
      ],
    },
  ],
}

/* ---------------------------------------------------------------- preguntas */

const PREGUNTAS = {
  id: 'preguntas', icono: 'bombilla', grupo: 'Hay que decidir', label: 'Las siete preguntas',
  h2: 'Lo que necesito de ti para seguir',
  lede:
    'Siete puntos. Cada uno dice de dónde sale —correo, reunión o comprobación— qué pasa si se resuelve y qué pasa si no. Marca la opción y, si hace falta, escribe debajo. Al final, en «Tus respuestas», lo copias y me lo pegas.',
  obs: false,
  blocks: [
    { t: 'indice' },

    {
      t: 'pregunta', n: 1, crit: true,
      h: 'A1 · El registro A del subdominio apunta a una IP que no es',
      cuerpo: [
        '<b>De dónde sale:</b> Javier, 18/09: «Subdominio: presupuesto.oraviatravel.com. Registro tipo A apuntando a la IP 192.20.235.4».',
        '<b>El problema:</b> el servidor es <code>195</code>.20.235.4. Es un dígito, y con él mal el subdominio no lleva a ninguna parte.',
        '<b>Qué desbloquea:</b> sin DNS correcto no se puede sacar el certificado, así que la app sigue respondiendo por IP y sin cifrar. Hoy el token de sesión viaja en claro y <b>los enlaces que reciben los colegios llevan la IP dentro</b>: el día que cambiemos al dominio, los enlaces ya enviados dejarán de funcionar. Por eso conviene antes de mandar propuestas de verdad.',
        '<b>El correo ya está redactado</b> en <code>correo-dns-javier.md</code>.',
      ],
      ops: [
        '<b>A · Se lo pido a Javier</b> con el correo que está redactado.',
        '<b>B · Ya se lo he pedido</b> y estoy esperando respuesta.',
        '<b>C · Ya está corregido.</b> Adelante con el certificado.',
      ],
      rec: 'A',
      comentario: 'Si ya lo pediste, ¿qué día? Para saber cuándo insistir.',
    },

    {
      t: 'pregunta', n: 2, crit: true,
      h: 'A2 · Dices que los dos buzones se usan, pero están vacíos',
      cuerpo: [
        '<b>Tu respuesta:</b> «se usan los dos, si no me equivoco así lo pidió Javier». Y es verdad: Javier los pidió como usuarios de la plataforma el 15/07.',
        '<b>Lo que no cuadra:</b> entré por IMAP a <code>groups@oraviatravel.com</code> y a <code>sports@oraviatravel.com</code> y los dos INBOX tienen <b>0 mensajes</b>. Si el equipo escribiera a los colegios desde ahí, habría cientos.',
        '<b>Tres explicaciones posibles:</b> que sean buzones nuevos estrenados en agosto y la correspondencia siga en los de <code>viajesvelero.com</code>; que el equipo trabaje desde otra carpeta y el INBOX quede vacío al archivar; o que cada gestor escriba desde su propia dirección y groups@ solo sirva para entrar en Zoho.',
        '<b>Qué desbloquea:</b> toda la bandeja de entrada. La app tiene que saber <b>dónde</b> mirar: si mira el INBOX y el correo está en otra carpeta, no verá nada y parecerá que está rota.',
      ],
      ops: [
        '<b>A · Son nuevos</b> y la correspondencia viva sigue en los buzones antiguos de viajesvelero.com.',
        '<b>B · Se usan, pero se archiva:</b> el correo entra y se mueve a carpetas. Hay que mirar ahí, no en el INBOX.',
        '<b>C · Cada gestor escribe desde su dirección personal</b> y groups@ es solo el usuario de Zoho.',
        '<b>D · Lo pregunto a Javier</b> y te digo.',
      ],
      rec: 'D',
      comentario: 'Si sabes en qué carpeta cae el correo de los colegios, dímelo aquí: es lo único que necesito.',
    },

    {
      t: 'pregunta', n: 3, crit: false,
      h: 'A3 · Tienes razón: no hace falta el módulo de Productos',
      cuerpo: [
        '<b>Tu pregunta:</b> «El tema de productos no sería necesario, ya que nosotros lo gestionamos en nuestra base de datos de tarifas. ¿es así?»',
        '<b>Lo he comprobado y sí.</b> El subformulario «Servicios Contratados» de su CRM tiene veinte campos y solo uno es obligatorio: <code>Parent_Id</code>, que es el enlace al propio trato. <b>Servicio y Proveedor son opcionales.</b>',
        '<b>Qué significa:</b> podemos rellenar el subformulario entero —cantidad, viajeros, precio de venta, coste, fechas de entrada y salida, régimen— sin tocar los módulos Productos ni Proveedores. Y eso es lo que alimenta sus fórmulas de margen: «Coste por viajero», «PVP por viajero», «Total Servicios Contratados».',
        '<b>Lo único que se pierde:</b> el enlace al catálogo de Productos de Zoho. Si algún día quieren un informe «cuánto hemos vendido de PortAventura», sin ese enlace habría que sacarlo del nombre en texto, no de un campo.',
        '<b>Y desaparece un bloqueante:</b> ya no haría falta pedirles que vuelvan a autorizar Zoho.',
      ],
      ops: [
        '<b>A · Sin enlazar a Productos.</b> El nombre del servicio y el proveedor van como texto. Se quita el bloqueante y se puede empezar ya.',
        '<b>B · Enlazando a Productos.</b> Hay que pedirles el permiso de Zoho y que confirmen que su catálogo de Productos tiene los hoteles y actividades con los que casar los nuestros.',
      ],
      rec: 'A',
      comentario: '¿Usan los informes por producto de Zoho? Si no los usan, la opción A no les quita nada.',
    },

    {
      t: 'pregunta', n: 4, crit: false,
      h: 'A4 · Dónde se añade «Catalán», paso a paso',
      cuerpo: [
        '<b>Tu petición:</b> «dime dónde lo añado y lo hago yo».',
        '<b>El camino:</b> Zoho CRM → <b>Configuración</b> (la rueda dentada, arriba a la derecha) → <b>Personalización</b> → <b>Módulos y campos</b> → eliges el módulo → pestaña <b>Campos</b> → buscas <b>«Idioma»</b> → los tres puntos a su derecha → <b>Editar propiedades</b> → <b>+ Añadir opción</b> → escribes <code>Catalán</code> → Guardar.',
        '<b>Ojo, son TRES campos distintos con el mismo nombre.</b> Hay que repetirlo en <b>Oportunidades</b>, <b>Contactos</b> y <b>Cuentas</b>. Lo comprobé: cada módulo tiene su propio campo «Idioma» personalizado, y los tres tienen hoy las mismas tres opciones: Español, Francés e Inglés.',
        '<b>Escríbelo exactamente <code>Catalán</code></b>, con tilde y mayúscula inicial, como los otros tres. La app manda el valor tal cual y Zoho rechaza lo que no coincide.',
        '<b>Qué desbloquea:</b> hoy un viaje que llega en catalán se queda <b>sin idioma</b> en el CRM, porque prefiero dejar el campo vacío a inventar un valor que Zoho no reconoce.',
      ],
      ops: [
        '<b>A · Lo hago yo</b> en los tres módulos.',
        '<b>B · Se lo pido a Oravia</b>, que es su CRM y prefiero que lo toquen ellos.',
        '<b>C · Ya está hecho.</b>',
      ],
      rec: 'A',
      comentario: 'Si al hacerlo ves que algún módulo ya lo tenía, dímelo.',
    },

    {
      t: 'pregunta', n: 5, crit: true,
      h: 'A5 · Las cuatro decisiones de negocio, una por una',
      cuerpo: [
        '<b>Tu respuesta fue «no lo entiendo»,</b> y con razón: te las puse como una línea. Van desarrolladas.',
        '<b>1 · El tipo de pago.</b> Su CRM tiene un campo «Tipo de pago» con dos valores, Crédito y Prepago, relleno en el 90% de sus 1.000 tratos. Hoy no lo rellenamos: cuando la app crea la oportunidad —al enviar la propuesta— el colegio todavía no ha elegido opción ni se ha pactado nada, así que sería adivinar. <b>Mi propuesta: preguntarlo cuando el colegio acepta</b>, que es cuando arranca el depósito. Ver la pestaña «Decisiones».',
        '<b>2 · La forma de cobro.</b> Hoy escribimos siempre «Deposito 30%», que es el acuerdo de junio y lo que llevan 735 de sus tratos. Pero su lista mezcla porcentajes con medios de pago —Transferencia, TPV, Efectivo, Pay Gold—, así que puede que no sea un valor fijo. <b>¿Es siempre 30%, o se pacta con cada colegio?</b>',
        '<b>3 · Qué es un «cliente especial».</b> Javier, 14/08, sobre PortAventura: «Cliente genérico PVP − 14%, Cliente especial PVP − 17%. El coste para ambas es PVP − 20%». La app solo conoce dos tipos: genérico y turoperador suizo. <b>Ese «especial» no existe en la app</b>, y hasta saber qué es no se puede cotizar PortAventura bien. ¿Es el turoperador suizo con otro nombre, o un tercer tipo?',
        '<b>Qué desbloquea:</b> la 1 y la 2, que la oportunidad nazca completa. La 3, poder cotizar PortAventura con el precio correcto.',
      ],
      ops: [
        '<b>A · Las contesto yo</b>, que me sé el acuerdo comercial.',
        '<b>B · Se las pregunto a Javier y a Ruth</b> y te traigo la respuesta.',
        '<b>C · Mezcla:</b> algunas las sé y otras hay que preguntarlas. Lo detallo abajo.',
      ],
      rec: 'C',
      comentario: 'Contesta aquí las que sepas: 1) tipo de pago, ¿al aceptar? · 2) forma de cobro, ¿siempre 30%? · 3) «cliente especial», ¿qué es?',
    },

    {
      t: 'pregunta', n: 6, crit: false,
      h: 'A6 · Dos preguntas de Ruth que llevan diez días sin contestar',
      cuerpo: [
        '<b>Tu respuesta fue «a qué te refieres».</b> Son dos preguntas que Ruth te hizo por correo el 15 de septiembre y que se quedaron sin responder cuando la conversación se fue a la formación del 21.',
        '<b>La primera, sobre las tarifas 4R:</b> «Respecto a las tarifas, ¿habéis incluido todo el documento o dejasteis fuera 4R como os indiqué, porque lo veo en la lista? Está indicado como Coste +8% pero vosotros lo habéis nombrado como Venta (cualquier cliente). ¿Cuál es la diferencia? Y por otro lado, ¿elimino el que yo cargué entonces?»',
        '<b>La segunda, sobre Fútbol Salou:</b> «Tarifas Futbol Salou 2027 pone: <i>pendiente de revisar</i>, ¿a qué se refiere?»',
        '<b>Por qué importan:</b> las dos son sobre <b>qué tarifas están cargadas y cuáles sobran</b>. Mientras no se aclare, el catálogo tiene filas duplicadas o dudosas y quien cotiza no sabe cuál coger. Y Ruth preguntó si borra la suya: si la borra y era la buena, se pierde.',
      ],
      ops: [
        '<b>A · Las contesto yo</b>, que sé qué se cargó y qué no.',
        '<b>B · Las miramos juntos</b> contra el catálogo antes de contestar.',
        '<b>C · Ya están contestadas</b> por otra vía.',
      ],
      rec: 'B',
      comentario: 'Si te acuerdas de qué se decidió con las 4R, escríbelo aquí y lo compruebo contra el catálogo.',
    },

    {
      t: 'pregunta', n: 7, crit: true,
      h: 'A7 · El servidor no tiene copias de seguridad, y el hosting nos espera',
      cuerpo: [
        '<b>Tu respuesta fue «tampoco entiendo».</b> Sale de un correo que reenvió Javier el 22/09 con lo que le dijeron sus técnicos.',
        '<b>Lo que dijeron, literal:</b> «Neointec se ha encargado de instalar su aplicación y todo lo necesario para que funcione, nosotros desconocemos qué tareas se han realizado en el servidor por lo que <b>ha de ser Neointec quien complete su instalación, certificados y servicios web</b>. Neointec dispone de usuario con privilegios de administrador. <b>Una vez terminen, que nos avisen para configurar y poner en marcha las copias de seguridad.</b>»',
        '<b>Qué significa:</b> dos cosas que yo tenía apuntadas como suyas son nuestras. El certificado SSL lo sacamos nosotros —es A1 más un comando—. Y las copias de seguridad las montan ellos, <b>pero están esperando a que les digamos que hemos terminado</b>.',
        '<b>El riesgo:</b> hoy el servidor lleva la base de datos con las tarifas, los clientes y las propuestas, y <b>no hay ninguna copia</b>. Si se pierde el disco, se pierde todo el trabajo de carga del catálogo.',
        '<b>Qué hay que hacer:</b> cuando el certificado esté puesto (A1 + el comando), escribir al hosting diciendo que hemos terminado para que activen las copias.',
      ],
      ops: [
        '<b>A · Escribo yo al hosting</b> cuando me digas que el certificado está.',
        '<b>B · Lo escribes tú</b> a Javier para que se lo traslade a sus técnicos.',
        '<b>C · Que lo lleve Cristian</b>, que fue quien habló con ellos.',
      ],
      rec: 'B',
      comentario: 'Los técnicos del hosting escriben desde granota.net, por si prefieres ir directo.',
    },
  ],
}

/* ---------------------------------------------------------------- respuestas */

const RESPUESTAS = {
  id: 'respuestas', icono: 'flecha', grupo: 'Hay que decidir', label: 'Tus respuestas',
  h2: 'Copia esto y me lo pegas',
  lede:
    'Lo que marques se guarda solo en este navegador. Cuando lo tengas, pulsa Copiar y me lo mandas por donde quieras.',
  obs: false,
  blocks: [
    {
      t: 'respuestas',
      correos: ['aquinatoa@neointec.com'],
      cabecera: 'RESPUESTAS · Consola Oravia · plan de acción',
      firma: 'Anthony Quinatoa · Neointec',
      critK: 'bloquean',
      nota: [
        'Las marcadas como <b>bloquean</b> son las que impiden seguir: A1, A2, A5 y A7.',
        'Lo que escribas en los cuadros de texto también se copia, así que no hace falta repetirlo en el correo.',
      ],
    },
  ],
}

export const PANELS = [ESTADO, BLOQUEA, CORREO, RECORRIDO, PRODUCTO, CRM, USUARIOS, PREGUNTAS, DECISIONES, PROXIMOS, RESPUESTAS]
