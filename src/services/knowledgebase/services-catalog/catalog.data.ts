// Base de conocimiento: Servicios del despacho Compromiso Legal

export interface Servicio {
  id: string
  nombre: string
  categoria: string
  descripcion: string
  keywords: string[]
  precioOrientativo?: string
}

export const CATEGORIAS = {
  CIVIL: 'Derecho Civil',
  FAMILIA: 'Derecho de Familia',
  LABORAL: 'Derecho Laboral',
  PENAL: 'Derecho Penal',
  MERCANTIL: 'Derecho Mercantil',
  ADMINISTRATIVO: 'Derecho Administrativo',
  INMOBILIARIO: 'Derecho Inmobiliario',
  EXTRANJERIA: 'Extranjería',
  CONSUMO: 'Derecho del Consumidor',
  HERENCIAS: 'Herencias y Sucesiones',
}

export const SERVICIOS: Servicio[] = [
  // ============ DERECHO CIVIL ============
  {
    id: 'civil-001',
    nombre: 'Reclamación de deudas',
    categoria: CATEGORIAS.CIVIL,
    descripcion: 'Recuperación de deudas impagadas mediante vía judicial o extrajudicial. Incluye burofax, demanda monitorio y ejecución.',
    keywords: ['deuda', 'impago', 'moroso', 'dinero', 'pagar', 'cobrar', 'monitorio'],
    precioOrientativo: 'Desde 300€ + % recuperado'
  },
  {
    id: 'civil-002',
    nombre: 'Reclamación de daños y perjuicios',
    categoria: CATEGORIAS.CIVIL,
    descripcion: 'Indemnización por daños materiales, personales o morales causados por terceros.',
    keywords: ['daño', 'perjuicio', 'indemnización', 'compensación', 'accidente'],
    precioOrientativo: 'Consultar según caso'
  },
  {
    id: 'civil-003',
    nombre: 'Contratos civiles',
    categoria: CATEGORIAS.CIVIL,
    descripcion: 'Redacción, revisión y negociación de todo tipo de contratos civiles: compraventa, arrendamiento, préstamo, etc.',
    keywords: ['contrato', 'acuerdo', 'documento', 'firmar', 'redactar'],
    precioOrientativo: 'Desde 150€'
  },
  {
    id: 'civil-004',
    nombre: 'Responsabilidad civil',
    categoria: CATEGORIAS.CIVIL,
    descripcion: 'Defensa o reclamación en casos de responsabilidad civil contractual o extracontractual.',
    keywords: ['responsabilidad', 'culpa', 'negligencia', 'seguro'],
    precioOrientativo: 'Consultar según caso'
  },
  {
    id: 'civil-005',
    nombre: 'Incapacitación judicial',
    categoria: CATEGORIAS.CIVIL,
    descripcion: 'Procedimientos de modificación de la capacidad de obrar y nombramiento de tutor o curador.',
    keywords: ['incapacidad', 'tutor', 'curador', 'alzheimer', 'demencia', 'discapacidad'],
    precioOrientativo: 'Desde 800€'
  },

  // ============ DERECHO DE FAMILIA ============
  {
    id: 'familia-001',
    nombre: 'Divorcio de mutuo acuerdo',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Tramitación de divorcio cuando ambos cónyuges están de acuerdo en las condiciones.',
    keywords: ['divorcio', 'separación', 'mutuo acuerdo', 'matrimonio'],
    precioOrientativo: 'Desde 400€ (ambos cónyuges)'
  },
  {
    id: 'familia-002',
    nombre: 'Divorcio contencioso',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Representación en divorcio cuando no hay acuerdo entre las partes.',
    keywords: ['divorcio', 'contencioso', 'juicio', 'separación'],
    precioOrientativo: 'Desde 1.200€'
  },
  {
    id: 'familia-003',
    nombre: 'Custodia de hijos',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Establecimiento o modificación de custodia: compartida, exclusiva, régimen de visitas.',
    keywords: ['custodia', 'hijos', 'niños', 'visitas', 'menores', 'compartida'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'familia-004',
    nombre: 'Pensión de alimentos',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Reclamación, modificación o extinción de pensión de alimentos para hijos.',
    keywords: ['pensión', 'alimentos', 'manutención', 'hijos', 'pagar'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'familia-005',
    nombre: 'Pensión compensatoria',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Reclamación o defensa ante solicitud de pensión compensatoria entre cónyuges.',
    keywords: ['pensión', 'compensatoria', 'divorcio', 'cónyuge'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'familia-006',
    nombre: 'Convenio regulador',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Redacción del convenio que regula los efectos del divorcio: hijos, bienes, pensiones.',
    keywords: ['convenio', 'regulador', 'divorcio', 'acuerdo'],
    precioOrientativo: 'Desde 300€'
  },
  {
    id: 'familia-007',
    nombre: 'Pareja de hecho',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Constitución, regulación y disolución de parejas de hecho.',
    keywords: ['pareja', 'hecho', 'convivencia', 'registro'],
    precioOrientativo: 'Desde 200€'
  },
  {
    id: 'familia-008',
    nombre: 'Impugnación de paternidad',
    categoria: CATEGORIAS.FAMILIA,
    descripcion: 'Procedimientos para impugnar o reclamar la paternidad biológica.',
    keywords: ['paternidad', 'ADN', 'padre', 'hijo', 'biológico'],
    precioOrientativo: 'Desde 1.000€'
  },

  // ============ DERECHO LABORAL ============
  {
    id: 'laboral-001',
    nombre: 'Despido improcedente',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Reclamación por despido improcedente: indemnización o readmisión.',
    keywords: ['despido', 'improcedente', 'trabajo', 'echar', 'indemnización'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'laboral-002',
    nombre: 'Despido disciplinario',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Defensa ante despido por causas disciplinarias.',
    keywords: ['despido', 'disciplinario', 'falta', 'sanción'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'laboral-003',
    nombre: 'Reclamación de salarios',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Reclamación de salarios impagados, horas extras, finiquito.',
    keywords: ['salario', 'sueldo', 'nómina', 'impago', 'finiquito', 'horas'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'laboral-004',
    nombre: 'Acoso laboral (mobbing)',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Asesoramiento y defensa en casos de acoso laboral o mobbing.',
    keywords: ['acoso', 'mobbing', 'trabajo', 'hostigamiento', 'jefe'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'laboral-005',
    nombre: 'Accidente de trabajo',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Reclamación de indemnización por accidente laboral o enfermedad profesional.',
    keywords: ['accidente', 'trabajo', 'lesión', 'enfermedad', 'profesional'],
    precioOrientativo: 'Consultar según caso'
  },
  {
    id: 'laboral-006',
    nombre: 'Incapacidad laboral',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Solicitud o reclamación de incapacidad temporal, permanente o gran invalidez.',
    keywords: ['incapacidad', 'invalidez', 'baja', 'permanente', 'temporal'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'laboral-007',
    nombre: 'ERE y despido colectivo',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Asesoramiento en expedientes de regulación de empleo y despidos colectivos.',
    keywords: ['ERE', 'despido', 'colectivo', 'regulación', 'empleo'],
    precioOrientativo: 'Consultar según caso'
  },
  {
    id: 'laboral-008',
    nombre: 'Negociación de finiquito',
    categoria: CATEGORIAS.LABORAL,
    descripcion: 'Revisión y negociación de condiciones de salida de la empresa.',
    keywords: ['finiquito', 'liquidación', 'salida', 'negociación'],
    precioOrientativo: 'Desde 300€'
  },

  // ============ DERECHO PENAL ============
  {
    id: 'penal-001',
    nombre: 'Defensa penal general',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Defensa en todo tipo de procedimientos penales: delitos y faltas.',
    keywords: ['penal', 'delito', 'juicio', 'defensa', 'acusación'],
    precioOrientativo: 'Desde 1.000€'
  },
  {
    id: 'penal-002',
    nombre: 'Violencia de género',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Defensa o acusación particular en casos de violencia de género.',
    keywords: ['violencia', 'género', 'maltrato', 'orden', 'alejamiento'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'penal-003',
    nombre: 'Delitos contra el patrimonio',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Defensa en casos de robo, hurto, estafa, apropiación indebida.',
    keywords: ['robo', 'hurto', 'estafa', 'fraude', 'engaño'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'penal-004',
    nombre: 'Delitos de tráfico',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Defensa en delitos contra la seguridad vial: alcoholemia, exceso velocidad, sin carnet.',
    keywords: ['tráfico', 'alcohol', 'carnet', 'velocidad', 'conducir'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'penal-005',
    nombre: 'Delitos informáticos',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Defensa o acusación en delitos cometidos a través de medios informáticos.',
    keywords: ['informático', 'internet', 'hacker', 'digital', 'ciberseguridad'],
    precioOrientativo: 'Desde 1.000€'
  },
  {
    id: 'penal-006',
    nombre: 'Juicio rápido',
    categoria: CATEGORIAS.PENAL,
    descripcion: 'Asistencia letrada urgente en juicios rápidos.',
    keywords: ['juicio', 'rápido', 'urgente', 'inmediato'],
    precioOrientativo: 'Desde 400€'
  },

  // ============ DERECHO MERCANTIL ============
  {
    id: 'mercantil-001',
    nombre: 'Constitución de sociedades',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Creación de sociedades: SL, SA, cooperativas, fundaciones.',
    keywords: ['sociedad', 'empresa', 'SL', 'SA', 'constituir', 'crear'],
    precioOrientativo: 'Desde 400€ + notaría'
  },
  {
    id: 'mercantil-002',
    nombre: 'Contratos mercantiles',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Redacción y revisión de contratos comerciales, franquicias, distribución.',
    keywords: ['contrato', 'mercantil', 'comercial', 'franquicia', 'empresa'],
    precioOrientativo: 'Desde 300€'
  },
  {
    id: 'mercantil-003',
    nombre: 'Concurso de acreedores',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Asesoramiento y representación en procedimientos concursales.',
    keywords: ['concurso', 'acreedores', 'quiebra', 'insolvencia', 'deudas'],
    precioOrientativo: 'Consultar según caso'
  },
  {
    id: 'mercantil-004',
    nombre: 'Reclamación entre empresas',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Reclamaciones por incumplimiento de contratos entre empresas.',
    keywords: ['empresa', 'incumplimiento', 'contrato', 'proveedor', 'cliente'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'mercantil-005',
    nombre: 'Protección de marca',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Registro y defensa de marcas y patentes.',
    keywords: ['marca', 'patente', 'registro', 'propiedad', 'intelectual'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'mercantil-006',
    nombre: 'Ley de Segunda Oportunidad',
    categoria: CATEGORIAS.MERCANTIL,
    descripcion: 'Procedimiento para cancelar deudas de particulares y autónomos.',
    keywords: ['segunda', 'oportunidad', 'deuda', 'cancelar', 'autónomo', 'BEPI'],
    precioOrientativo: 'Desde 2.000€'
  },

  // ============ DERECHO INMOBILIARIO ============
  {
    id: 'inmobiliario-001',
    nombre: 'Desahucio por impago',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Procedimiento de desahucio por falta de pago de alquiler.',
    keywords: ['desahucio', 'impago', 'alquiler', 'inquilino', 'arrendamiento'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'inmobiliario-002',
    nombre: 'Desahucio por fin de contrato',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Recuperación de la vivienda al finalizar el contrato de alquiler.',
    keywords: ['desahucio', 'contrato', 'fin', 'alquiler', 'recuperar'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'inmobiliario-003',
    nombre: 'Defensa del inquilino',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Defensa ante desahucios y reclamaciones del propietario.',
    keywords: ['inquilino', 'defensa', 'desahucio', 'alquiler', 'casero'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'inmobiliario-004',
    nombre: 'Compraventa de inmuebles',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Asesoramiento en compraventa de viviendas, locales y fincas.',
    keywords: ['compra', 'venta', 'vivienda', 'piso', 'casa', 'inmueble'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'inmobiliario-005',
    nombre: 'Contratos de alquiler',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Redacción y revisión de contratos de arrendamiento.',
    keywords: ['alquiler', 'contrato', 'arrendamiento', 'inquilino', 'casero'],
    precioOrientativo: 'Desde 150€'
  },
  {
    id: 'inmobiliario-006',
    nombre: 'Comunidades de propietarios',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Asesoramiento y reclamaciones en comunidades de vecinos.',
    keywords: ['comunidad', 'vecinos', 'propietarios', 'junta', 'cuota'],
    precioOrientativo: 'Desde 300€'
  },
  {
    id: 'inmobiliario-007',
    nombre: 'Vicios ocultos',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Reclamación por defectos ocultos en viviendas compradas.',
    keywords: ['vicios', 'ocultos', 'defectos', 'vivienda', 'compra'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'inmobiliario-008',
    nombre: 'Okupación',
    categoria: CATEGORIAS.INMOBILIARIO,
    descripcion: 'Procedimientos para recuperar viviendas ocupadas ilegalmente.',
    keywords: ['okupación', 'ocupación', 'ilegal', 'vivienda', 'recuperar'],
    precioOrientativo: 'Desde 800€'
  },

  // ============ EXTRANJERÍA ============
  {
    id: 'extranjeria-001',
    nombre: 'Permiso de residencia',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Solicitud y renovación de permisos de residencia.',
    keywords: ['residencia', 'permiso', 'extranjero', 'NIE', 'tarjeta'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'extranjeria-002',
    nombre: 'Permiso de trabajo',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Autorización de trabajo por cuenta ajena o propia.',
    keywords: ['trabajo', 'permiso', 'autorización', 'extranjero', 'empleo'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'extranjeria-003',
    nombre: 'Nacionalidad española',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Solicitud de nacionalidad española por residencia, matrimonio u origen.',
    keywords: ['nacionalidad', 'española', 'ciudadanía', 'pasaporte'],
    precioOrientativo: 'Desde 600€'
  },
  {
    id: 'extranjeria-004',
    nombre: 'Arraigo social/laboral',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Regularización por arraigo social, laboral o familiar.',
    keywords: ['arraigo', 'social', 'laboral', 'regularización', 'papeles'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'extranjeria-005',
    nombre: 'Reagrupación familiar',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Traer a familiares del extranjero a España.',
    keywords: ['reagrupación', 'familiar', 'familia', 'traer', 'extranjero'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'extranjeria-006',
    nombre: 'Recurso de expulsión',
    categoria: CATEGORIAS.EXTRANJERIA,
    descripcion: 'Defensa ante órdenes de expulsión y devolución.',
    keywords: ['expulsión', 'devolución', 'recurso', 'deportación'],
    precioOrientativo: 'Desde 800€'
  },

  // ============ DERECHO DEL CONSUMIDOR ============
  {
    id: 'consumo-001',
    nombre: 'Cláusulas abusivas',
    categoria: CATEGORIAS.CONSUMO,
    descripcion: 'Reclamación por cláusulas abusivas en contratos bancarios o de servicios.',
    keywords: ['cláusula', 'abusiva', 'banco', 'contrato', 'hipoteca'],
    precioOrientativo: 'Desde 300€'
  },
  {
    id: 'consumo-002',
    nombre: 'Gastos de hipoteca',
    categoria: CATEGORIAS.CONSUMO,
    descripcion: 'Reclamación de gastos de formalización de hipoteca.',
    keywords: ['hipoteca', 'gastos', 'notaría', 'registro', 'banco'],
    precioOrientativo: 'Desde 300€ + % recuperado'
  },
  {
    id: 'consumo-003',
    nombre: 'Tarjetas revolving',
    categoria: CATEGORIAS.CONSUMO,
    descripcion: 'Reclamación por intereses usurarios en tarjetas revolving.',
    keywords: ['tarjeta', 'revolving', 'intereses', 'usura', 'crédito'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'consumo-004',
    nombre: 'Reclamación a aerolíneas',
    categoria: CATEGORIAS.CONSUMO,
    descripcion: 'Compensación por retrasos, cancelaciones o pérdida de equipaje.',
    keywords: ['vuelo', 'avión', 'retraso', 'cancelación', 'equipaje', 'aerolínea'],
    precioOrientativo: 'Desde 100€'
  },
  {
    id: 'consumo-005',
    nombre: 'Productos defectuosos',
    categoria: CATEGORIAS.CONSUMO,
    descripcion: 'Reclamación por productos que no cumplen lo prometido.',
    keywords: ['producto', 'defectuoso', 'garantía', 'devolución', 'compra'],
    precioOrientativo: 'Desde 200€'
  },

  // ============ HERENCIAS Y SUCESIONES ============
  {
    id: 'herencias-001',
    nombre: 'Tramitación de herencia',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Gestión completa de herencias: inventario, partición y adjudicación.',
    keywords: ['herencia', 'heredero', 'fallecido', 'testamento', 'bienes'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'herencias-002',
    nombre: 'Testamento',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Asesoramiento y redacción de testamentos.',
    keywords: ['testamento', 'voluntad', 'herederos', 'legado'],
    precioOrientativo: 'Desde 150€'
  },
  {
    id: 'herencias-003',
    nombre: 'Impugnación de testamento',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Reclamación cuando el testamento no respeta los derechos de los herederos.',
    keywords: ['impugnar', 'testamento', 'legítima', 'desheredar'],
    precioOrientativo: 'Desde 1.000€'
  },
  {
    id: 'herencias-004',
    nombre: 'Reclamación de legítima',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Reclamación de la parte de herencia que corresponde por ley.',
    keywords: ['legítima', 'herencia', 'derecho', 'hijo', 'heredero'],
    precioOrientativo: 'Desde 800€'
  },
  {
    id: 'herencias-005',
    nombre: 'Declaración de herederos',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Tramitación cuando no hay testamento (herencia intestada).',
    keywords: ['herederos', 'intestada', 'testamento', 'declaración'],
    precioOrientativo: 'Desde 400€'
  },
  {
    id: 'herencias-006',
    nombre: 'Renuncia de herencia',
    categoria: CATEGORIAS.HERENCIAS,
    descripcion: 'Asesoramiento y tramitación de renuncia de herencia.',
    keywords: ['renuncia', 'herencia', 'rechazar', 'deudas'],
    precioOrientativo: 'Desde 200€'
  },

  // ============ DERECHO ADMINISTRATIVO ============
  {
    id: 'admin-001',
    nombre: 'Recurso de multas',
    categoria: CATEGORIAS.ADMINISTRATIVO,
    descripcion: 'Recurso contra multas de tráfico, urbanismo, etc.',
    keywords: ['multa', 'recurso', 'sanción', 'tráfico', 'ayuntamiento'],
    precioOrientativo: 'Desde 150€'
  },
  {
    id: 'admin-002',
    nombre: 'Licencias y permisos',
    categoria: CATEGORIAS.ADMINISTRATIVO,
    descripcion: 'Tramitación de licencias de actividad, obras, apertura.',
    keywords: ['licencia', 'permiso', 'actividad', 'obras', 'apertura'],
    precioOrientativo: 'Desde 300€'
  },
  {
    id: 'admin-003',
    nombre: 'Responsabilidad patrimonial',
    categoria: CATEGORIAS.ADMINISTRATIVO,
    descripcion: 'Reclamación a la Administración por daños causados.',
    keywords: ['administración', 'daño', 'reclamación', 'ayuntamiento', 'estado'],
    precioOrientativo: 'Desde 500€'
  },
  {
    id: 'admin-004',
    nombre: 'Urbanismo',
    categoria: CATEGORIAS.ADMINISTRATIVO,
    descripcion: 'Asesoramiento en cuestiones urbanísticas y de construcción.',
    keywords: ['urbanismo', 'construcción', 'licencia', 'obra', 'ilegal'],
    precioOrientativo: 'Consultar según caso'
  },
]

// Función para buscar servicios por keywords
export function buscarServicios(consulta: string): Servicio[] {
  const palabras = consulta.toLowerCase().split(/\s+/)
  
  return SERVICIOS.filter(servicio => {
    const textoServicio = `${servicio.nombre} ${servicio.descripcion} ${servicio.keywords.join(' ')}`.toLowerCase()
    return palabras.some(palabra => textoServicio.includes(palabra))
  }).slice(0, 5) // Máximo 5 resultados
}

// Función para obtener servicios por categoría
export function obtenerServiciosPorCategoria(categoria: string): Servicio[] {
  return SERVICIOS.filter(s => s.categoria === categoria)
}

// Función para obtener un servicio por ID
export function obtenerServicioPorId(id: string): Servicio | undefined {
  return SERVICIOS.find(s => s.id === id)
}
