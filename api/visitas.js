import { createHmac } from "node:crypto";

const MAX_BODY_BYTES = 12_000;
const APPS_SCRIPT_TIMEOUT_MS = 18_000;

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, maxLength);
}

function cleanDni(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function bodyObject(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && Buffer.byteLength(req.body, "utf8") <= MAX_BODY_BYTES) return JSON.parse(req.body);
  return {};
}

function clientKey(req, secret) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || "unknown";
  return createHmac("sha256", process.env.RATE_LIMIT_SALT || secret).update(ip).digest("hex");
}

function validateRegister(input) {
  const data = {
    studentName: cleanText(input.studentName, 80),
    studentDni: cleanDni(input.studentDni),
    primarySchool: cleanText(input.primarySchool, 100),
    adultName: cleanText(input.adultName, 80),
    email: cleanText(input.email, 120).toLowerCase(),
    phone: cleanText(input.phone, 25),
    attendees: Number(input.attendees),
    hasRelative: cleanText(input.hasRelative, 2),
    website: cleanText(input.website, 100)
  };

  if (data.website) return { error: "No pudimos procesar la solicitud." };
  if (data.studentName.length < 3 || data.primarySchool.length < 2 || data.adultName.length < 3) return { error: "Revisá los nombres y la escuela primaria." };
  if (!/^\d{7,9}$/.test(data.studentDni)) return { error: "Ingresá un DNI válido, sin puntos." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: "Ingresá un correo electrónico válido." };
  if (data.phone.length < 6) return { error: "Ingresá un teléfono válido." };
  if (!Number.isInteger(data.attendees) || data.attendees < 1 || data.attendees > 2) return { error: "Seleccioná una o dos personas." };
  if (!new Set(["Sí", "No"]).has(data.hasRelative)) return { error: "Indicá si ya tienen un vínculo con la escuela." };
  return { data };
}

function validateLookup(input) {
  const data = {
    code: cleanText(input.code, 24).toUpperCase()
  };
  if (!/^VIS-2026-[A-Z0-9]{4,12}$/.test(data.code)) return { error: "Revisá el código de reserva." };
  return { data };
}

async function callAppsScript(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Apps Script respondió ${response.status}`);
    const text = await response.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function backendStatus(payload) {
  if (payload?.ok) return 200;
  const map = {
    VALIDATION: 400,
    NOT_FOUND: 404,
    DUPLICATE: 409,
    NO_CAPACITY: 409,
    RATE_LIMIT: 429,
    UNAUTHORIZED: 502,
    CONFIG: 503
  };
  return map[payload?.code] || 502;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, message: "Método no permitido." });
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const backendSecret = process.env.BACKEND_SECRET;
  if (!appsScriptUrl || !backendSecret) {
    return send(res, 503, { ok: false, message: "El sistema todavía no fue configurado por la escuela." });
  }

  let input;
  try {
    input = bodyObject(req);
  } catch (error) {
    return send(res, 400, { ok: false, message: "La solicitud no tiene un formato válido." });
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_BODY_BYTES) {
    return send(res, 413, { ok: false, message: "La solicitud es demasiado grande." });
  }

  const action = cleanText(input.action, 16);
  let validated = {};
  if (action === "register") {
    const result = validateRegister(input);
    if (result.error) return send(res, 400, { ok: false, message: result.error });
    validated = result.data;
  } else if (action === "lookup") {
    const result = validateLookup(input);
    if (result.error) return send(res, 400, { ok: false, message: result.error });
    validated = result.data;
  } else if (action !== "status") {
    return send(res, 400, { ok: false, message: "Acción no válida." });
  }

  try {
    const payload = await callAppsScript(appsScriptUrl, {
      ...validated,
      action,
      secret: backendSecret,
      clientKey: clientKey(req, backendSecret)
    });
    if (payload && Object.prototype.hasOwnProperty.call(payload, "debugSecret")) delete payload.debugSecret;
    return send(res, backendStatus(payload), payload);
  } catch (error) {
    console.error("Backend de visitas no disponible:", error instanceof Error ? error.message : error);
    return send(res, 502, { ok: false, message: "El sistema de turnos no está disponible en este momento. Intentá nuevamente en unos minutos." });
  }
}

export { validateRegister, validateLookup };
