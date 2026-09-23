# Sistema de visitas — E.E.S.T. N.º 6 “Chacabuco”

Proyecto listo para desplegar en Vercel con Google Sheets y Google Apps Script como backend privado.

## Qué hace

- registra a cada familia en una planilla compartida;
- impide una segunda reserva activa con el mismo DNI;
- asigna atómicamente el primer recorrido con cupo para una nueva familia;
- contabiliza reservas familiares, con un máximo de 50 familias por visita;
- permite registrar una o dos personas dentro de cada familia sin consumir un segundo cupo;
- envía el comprobante solamente a la familia y conserva todos los datos administrativos en Google Sheets;
- entrega un comprobante imprimible con un código aleatorio difícil de adivinar;
- permite consultar la reserva utilizando solamente ese código;
- limita intentos y mantiene fuera del navegador la clave del backend;
- no publica un panel de administración ni una contraseña en la web.

## Fechas configuradas

Todos los recorridos son a las **16:00 h** y admiten hasta **50 familias**, de una o dos personas cada una:

- jueves 1 de octubre de 2026;
- martes 6 de octubre de 2026;
- jueves 8 de octubre de 2026;
- martes 13 de octubre de 2026;
- jueves 15 de octubre de 2026;
- martes 20 de octubre de 2026;
- jueves 22 de octubre de 2026;
- martes 27 de octubre de 2026.

El formulario corresponde únicamente a sexto año de primaria, por eso no pregunta el año que cursa el estudiante.

## Puesta en marcha

Seguir [CONFIGURACION.md](CONFIGURACION.md). Hay dos pasos que necesariamente debe autorizar el titular de las cuentas: desplegar el Apps Script desde la cuenta de Google y desplegar el proyecto desde la cuenta de Vercel.

## Estructura

- `index.html`, `styles.css`, `app.js`: web pública;
- `api/visitas.js`: función privada de Vercel que valida y protege la conexión;
- `google-apps-script/Code.gs`: cupos familiares, planilla y confirmación por correo;
- `.env.example`: variables requeridas en Vercel;
- `vercel.json`: función y cabeceras de seguridad.

## Administración

La administración es la propia hoja `Inscripciones` de Google Sheets, accesible solamente para las cuentas con las que se comparta la planilla. Cada fila incluye estudiante, DNI, escuela primaria, adulto responsable, correo, teléfono, cantidad de asistentes, vínculo, fecha, horario y estado del envío. Para cancelar una reserva se cambia su columna `Estado` a `Cancelada`; ese cupo familiar vuelve a estar disponible automáticamente.

## Enlace desde la página oficial

Una vez publicado, el encargado del sitio puede agregar:

```html
<a href="https://URL-DEL-PROYECTO.vercel.app">VISITAS</a>
```
