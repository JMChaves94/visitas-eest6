/**
 * Backend de visitas de la E.E.S.T. N.º 6 “Chacabuco”.
 * Este archivo se pega en Extensiones > Apps Script de una planilla nueva.
 */

const CORREO_ESCUELA = "REEMPLAZAR_POR_GMAIL_INSTITUCIONAL";
const NOMBRE_HOJA = "Inscripciones";
const ENCABEZADOS = [
  "Fecha de registro", "Código", "Estado", "Estudiante", "DNI",
  "Escuela primaria", "Adulto responsable", "Correo", "Teléfono", "Personas",
  "Familiar en escuela", "Fecha visita", "Hora visita", "Turno", "Estado correo"
];
const TURNOS = [
  { id: "2026-10-01-1600", fecha: "2026-10-01", hora: "16:00", capacidad: 50 },
  { id: "2026-10-06-1600", fecha: "2026-10-06", hora: "16:00", capacidad: 50 },
  { id: "2026-10-08-1600", fecha: "2026-10-08", hora: "16:00", capacidad: 50 },
  { id: "2026-10-13-1600", fecha: "2026-10-13", hora: "16:00", capacidad: 50 },
  { id: "2026-10-15-1600", fecha: "2026-10-15", hora: "16:00", capacidad: 50 },
  { id: "2026-10-20-1600", fecha: "2026-10-20", hora: "16:00", capacidad: 50 },
  { id: "2026-10-22-1600", fecha: "2026-10-22", hora: "16:00", capacidad: 50 },
  { id: "2026-10-27-1600", fecha: "2026-10-27", hora: "16:00", capacidad: 50 }
];

/** Ejecutar una sola vez desde el editor, con la planilla abierta. */
function configurarSistema() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CORREO_ESCUELA)) {
    throw new Error("Primero reemplazá CORREO_ESCUELA por el Gmail institucional.");
  }
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error("Este script debe estar vinculado a una planilla de Google Sheets.");

  const propiedades = PropertiesService.getScriptProperties();
  propiedades.setProperty("SPREADSHEET_ID", libro.getId());
  propiedades.setProperty("CORREO_ESCUELA", CORREO_ESCUELA);
  if (!propiedades.getProperty("BACKEND_SECRET")) {
    propiedades.setProperty("BACKEND_SECRET", Utilities.getUuid() + Utilities.getUuid());
  }
  prepararHoja_();

  console.log("BACKEND_SECRET=" + propiedades.getProperty("BACKEND_SECRET"));
  console.log("Configuración lista. Copiá el secreto anterior en Vercel como BACKEND_SECRET.");
}

function doGet() {
  return respuesta_({ ok: true, service: "visitas-eest6", year: 2026 });
}

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const config = configuracion_();
    if (!secretoValido_(datos.secret, config.secret)) {
      return respuesta_({ ok: false, code: "UNAUTHORIZED", message: "Solicitud no autorizada." });
    }

    if (datos.action === "status") return estado_();
    if (datos.action === "lookup") return buscar_(datos);
    if (datos.action === "register") return registrar_(datos);
    return respuesta_({ ok: false, code: "VALIDATION", message: "Acción no válida." });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return respuesta_({ ok: false, code: "SERVER_ERROR", message: "No pudimos completar la operación." });
  }
}

function registrar_(datos) {
  const validacion = validarRegistro_(datos);
  if (validacion) return respuesta_({ ok: false, code: "VALIDATION", message: validacion });
  if (!admitirSolicitud_(datos.clientKey)) {
    return respuesta_({ ok: false, code: "RATE_LIMIT", message: "Se hicieron demasiados intentos. Esperá diez minutos y volvé a probar." });
  }

  const candado = LockService.getScriptLock();
  try {
    candado.waitLock(30000);
  } catch (error) {
    return respuesta_({ ok: false, code: "SERVER_ERROR", message: "Hay muchas inscripciones simultáneas. Intentá nuevamente." });
  }

  let reserva;
  let fila;
  try {
    const hoja = prepararHoja_();
    const filas = obtenerFilas_(hoja);
    const dni = limpiarDni_(datos.studentDni);
    const duplicada = filas.some(function (row) {
      return limpiarDni_(row[4]) === dni && normalizar_(row[2]) !== "cancelada";
    });
    if (duplicada) {
      return respuesta_({ ok: false, code: "DUPLICATE", message: "Ya existe una reserva activa con este DNI." });
    }

    // El cupo corresponde a familias/reservas, no a la cantidad de asistentes.
    // El dato de asistentes se guarda únicamente como información de la reserva.
    const ocupacion = contarFamiliasActivasPorTurno_(filas);
    const personas = Number(datos.attendees);
    const turno = TURNOS.find(function (item) {
      return (ocupacion[item.id] || 0) < item.capacidad;
    });
    if (!turno) {
      return respuesta_({ ok: false, code: "NO_CAPACITY", message: "No quedan cupos disponibles para nuevas familias." });
    }

    const codigo = siguienteCodigo_(filas);
    reserva = {
      code: codigo,
      studentName: limpiarTexto_(datos.studentName, 80),
      studentDni: dni,
      primarySchool: limpiarTexto_(datos.primarySchool, 100),
      adultName: limpiarTexto_(datos.adultName, 80),
      email: limpiarTexto_(datos.email, 120).toLowerCase(),
      phone: limpiarTexto_(datos.phone, 25),
      attendees: personas,
      hasRelative: limpiarTexto_(datos.hasRelative, 2),
      date: turno.fecha,
      time: turno.hora,
      shiftId: turno.id
    };

    const valoresFila = [
      new Date(), reserva.code, "Confirmada", reserva.studentName, reserva.studentDni,
      reserva.primarySchool, reserva.adultName, reserva.email, reserva.phone, reserva.attendees,
      reserva.hasRelative, reserva.date, reserva.time, reserva.shiftId, "Pendiente"
    ];
    fila = hoja.getLastRow() + 1;
    hoja.getRange(fila, 1, 1, valoresFila.length).setValues([valoresFila]);
    SpreadsheetApp.flush();
  } finally {
    candado.releaseLock();
  }

  const correo = enviarConfirmacion_(reserva);
  prepararHoja_().getRange(fila, 15).setValue(correo.estado);
  SpreadsheetApp.flush();
  return respuesta_({ ok: true, reservation: reservaPublica_(reserva), emailSent: correo.completo });
}

function estado_() {
  const filas = obtenerFilas_(prepararHoja_());
  const ocupacion = contarFamiliasActivasPorTurno_(filas);
  const schedule = TURNOS.map(function (turno) {
    const occupied = ocupacion[turno.id] || 0;
    return {
      id: turno.id,
      date: turno.fecha,
      time: turno.hora,
      capacity: turno.capacidad,
      occupied: occupied,
      available: Math.max(0, turno.capacidad - occupied)
    };
  });
  const nextShift = schedule.find(function (turno) { return turno.available > 0; }) || null;
  return respuesta_({ ok: true, nextShift: nextShift, schedule: schedule });
}

function buscar_(datos) {
  if (!admitirSolicitud_(datos.clientKey, "bus", 20)) {
    return respuesta_({ ok: false, code: "RATE_LIMIT", message: "Se hicieron demasiadas búsquedas. Esperá diez minutos y volvé a probar." });
  }
  const codigo = limpiarTexto_(datos.code, 24).toUpperCase();
  if (!/^VIS-2026-[A-Z0-9]{4,12}$/.test(codigo)) {
    return respuesta_({ ok: false, code: "VALIDATION", message: "Revisá el código de reserva." });
  }
  const fila = obtenerFilas_(prepararHoja_()).find(function (row) {
    return String(row[1]).toUpperCase() === codigo && normalizar_(row[2]) !== "cancelada";
  });
  if (!fila) return respuesta_({ ok: false, code: "NOT_FOUND", message: "No encontramos una reserva activa con esos datos." });
  return respuesta_({
    ok: true,
    reservation: reservaPublica_({
      code: fila[1], studentName: fila[3], studentDni: fila[4], adultName: fila[6],
      attendees: fila[9], date: fila[11], time: fila[12]
    })
  });
}

function enviarConfirmacion_(reserva) {
  const config = configuracion_();
  const fecha = fechaLarga_(reserva.date);
  const asuntoFamilia = "Reserva confirmada · E.E.S.T. N.º 6 · " + fecha;
  const textoFamilia = [
    "Reserva confirmada", "", "Código: " + reserva.code,
    "Estudiante: " + reserva.studentName, "Fecha: " + fecha,
    "Horario: " + reserva.time + " h", "Personas: " + reserva.attendees,
    "", "IMPORTANTE SOBRE LA VISITA",
    "La visita admite un máximo de 2 personas por familia. Presentarse a las 15:50 h.",
    "", "INVITACIÓN A EXPO CHACA · 12 DE NOVIEMBRE",
    "Toda la comunidad está invitada a recorrer la escuela y conocer los proyectos realizados por nuestros estudiantes.",
    "Para Expo Chaca no hace falta reservar ni completar ningún formulario y no hay límite de asistentes por familia.",
    "", "¡Los esperamos!", "E.E.S.T. N.º 6 “Chacabuco”"
  ].join("\n");
  const htmlFamilia = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">' +
    '<h2 style="color:#0b1029">Reserva confirmada</h2><p>Hola ' + html_(reserva.adultName) + ', la visita de <strong>' + html_(reserva.studentName) + '</strong> quedó registrada.</p>' +
    '<p style="padding:14px;background:#eaf3fb;border-radius:8px"><strong>Código: ' + html_(reserva.code) + '</strong><br>Fecha: ' + html_(fecha) + '<br>Horario: ' + html_(reserva.time) + ' h<br>Personas: ' + html_(reserva.attendees) + '</p>' +
    '<p><strong>Importante sobre la visita:</strong> se admite un máximo de <strong>2 personas por familia</strong>. Presentarse a las <strong>15:50 h</strong>.</p>' +
    '<div style="margin:24px 0;padding:18px;background:#0b1029;color:#ffffff;border-radius:12px">' +
      '<p style="margin:0 0 6px;color:#79cdf2;font-size:12px;font-weight:bold;letter-spacing:1px">INVITACIÓN ABIERTA · 12 DE NOVIEMBRE</p>' +
      '<h3 style="margin:0 0 10px;color:#ffffff">También los invitamos a Expo Chaca</h3>' +
      '<p style="margin:0 0 10px">Toda la comunidad está invitada a recorrer la escuela y conocer los proyectos realizados por nuestros estudiantes.</p>' +
      '<p style="margin:0"><strong>No hace falta reservar ni completar ningún formulario y no hay límite de asistentes por familia.</strong></p>' +
    '</div>' +
    '<p>¡Los esperamos!</p><p>E.E.S.T. N.º 6 “Chacabuco”</p></div>';

  let familiaOk = false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error("Sin cuota de correo disponible");
    MailApp.sendEmail({ to: reserva.email, subject: asuntoFamilia, body: textoFamilia, htmlBody: htmlFamilia, name: "E.E.S.T. N.º 6 Chacabuco", replyTo: config.emailEscuela });
    familiaOk = true;
  } catch (error) {
    console.error("Correo a familia: " + error.message);
  }
  return { completo: familiaOk, estado: familiaOk ? "Confirmación enviada" : "ERROR al enviar confirmación" };
}

function validarRegistro_(datos) {
  if (limpiarTexto_(datos.studentName, 80).length < 3) return "Revisá el nombre del estudiante.";
  if (!/^\d{7,9}$/.test(limpiarDni_(datos.studentDni))) return "Ingresá un DNI válido, sin puntos.";
  if (limpiarTexto_(datos.primarySchool, 100).length < 2) return "Ingresá la escuela primaria.";
  if (limpiarTexto_(datos.adultName, 80).length < 3) return "Revisá el nombre del adulto responsable.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpiarTexto_(datos.email, 120))) return "Ingresá un correo electrónico válido.";
  if (limpiarTexto_(datos.phone, 25).length < 6) return "Ingresá un teléfono válido.";
  if (!Number.isInteger(Number(datos.attendees)) || Number(datos.attendees) < 1 || Number(datos.attendees) > 2) return "Seleccioná una o dos personas.";
  if (["Sí", "No"].indexOf(limpiarTexto_(datos.hasRelative, 2)) === -1) return "Indicá si ya tienen un vínculo con la escuela.";
  return "";
}

function admitirSolicitud_(clientKey, tipo, maximo) {
  const prefijo = tipo || "reg";
  const limite = maximo || 8;
  const key = prefijo + "_" + limpiarTexto_(clientKey, 80);
  if (key === prefijo + "_") return false;
  const cache = CacheService.getScriptCache();
  const intentos = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(intentos), 600);
  return intentos <= limite;
}

function prepararHoja_() {
  const config = configuracion_();
  const libro = SpreadsheetApp.openById(config.spreadsheetId);
  let hoja = libro.getSheetByName(NOMBRE_HOJA);
  if (!hoja) hoja = libro.insertSheet(NOMBRE_HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight("bold").setBackground("#0b1029").setFontColor("#ffffff");
    hoja.autoResizeColumns(1, ENCABEZADOS.length);
  }
  return hoja;
}

function obtenerFilas_(hoja) {
  const cantidad = hoja.getLastRow() - 1;
  return cantidad > 0 ? hoja.getRange(2, 1, cantidad, ENCABEZADOS.length).getValues() : [];
}

/**
 * Cuenta reservas/familias activas. Cada fila válida suma exactamente 1,
 * independientemente de si en la columna "Personas" figura 1 o 2.
 */
function contarFamiliasActivasPorTurno_(filas) {
  const turnosValidos = new Set(TURNOS.map(function (turno) { return turno.id; }));
  return filas.reduce(function (totales, row) {
    const codigo = String(row[1] || "").trim();
    const id = String(row[13] || "").trim();
    if (codigo && turnosValidos.has(id) && normalizar_(row[2]) !== "cancelada") {
      totales[id] = (totales[id] || 0) + 1;
    }
    return totales;
  }, {});
}

/**
 * Función de diagnóstico: se puede ejecutar manualmente desde Apps Script.
 * Muestra en el registro la planilla y la pestaña exactas donde se guardan los datos.
 */
function verificarDestinoDatos() {
  const config = configuracion_();
  const hoja = prepararHoja_();
  const filas = obtenerFilas_(hoja);
  const ocupacion = contarFamiliasActivasPorTurno_(filas);

  console.log("PLANILLA_DATOS=https://docs.google.com/spreadsheets/d/" + config.spreadsheetId + "/edit");
  console.log("PESTAÑA_DATOS=" + hoja.getName());
  console.log("RESERVAS_GUARDADAS=" + filas.filter(function (row) { return String(row[1] || "").trim(); }).length);
  console.log("FAMILIAS_POR_TURNO=" + JSON.stringify(ocupacion));
}

function siguienteCodigo_(filas) {
  const usados = new Set(filas.map(function (row) { return String(row[1]).toUpperCase(); }));
  for (let intento = 0; intento < 10; intento += 1) {
    const sufijo = Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
    const codigo = "VIS-2026-" + sufijo;
    if (!usados.has(codigo)) return codigo;
  }
  throw new Error("No se pudo generar un código de reserva único.");
}

function configuracion_() {
  const propiedades = PropertiesService.getScriptProperties();
  const config = {
    spreadsheetId: propiedades.getProperty("SPREADSHEET_ID"),
    emailEscuela: propiedades.getProperty("CORREO_ESCUELA"),
    secret: propiedades.getProperty("BACKEND_SECRET")
  };
  if (!config.spreadsheetId || !config.emailEscuela || !config.secret) {
    throw new Error("Falta ejecutar configurarSistema().");
  }
  return config;
}

function secretoValido_(recibido, esperado) {
  if (!recibido || !esperado || String(recibido).length !== String(esperado).length) return false;
  let diferencia = 0;
  for (let i = 0; i < String(esperado).length; i += 1) diferencia |= String(recibido).charCodeAt(i) ^ String(esperado).charCodeAt(i);
  return diferencia === 0;
}

function reservaPublica_(reserva) {
  return {
    code: String(reserva.code), studentName: String(reserva.studentName), studentDni: String(reserva.studentDni),
    adultName: String(reserva.adultName), attendees: Number(reserva.attendees), date: fechaIso_(reserva.date), time: String(reserva.time)
  };
}

function limpiarTexto_(valor, maximo) {
  return String(valor == null ? "" : valor).trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, maximo);
}

function limpiarDni_(valor) { return String(valor == null ? "" : valor).replace(/\D/g, ""); }
function normalizar_(valor) { return String(valor == null ? "" : valor).trim().toLowerCase(); }
function fechaIso_(valor) { return valor instanceof Date ? Utilities.formatDate(valor, "America/Argentina/Buenos_Aires", "yyyy-MM-dd") : String(valor); }
function fechaLarga_(iso) {
  const partes = String(iso).split("-");
  const fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return dias[fecha.getDay()] + " " + fecha.getDate() + " de " + meses[fecha.getMonth()] + " de " + fecha.getFullYear();
}
function html_(valor) { return String(valor == null ? "" : valor).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function respuesta_(objeto) { return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON); }
