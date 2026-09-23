# Sistema de visitas — E.E.S.T. N.º 6 “Chacabuco”

Proyecto listo para desplegar en Vercel con Google Sheets y Google Apps Script como backend privado.

## Qué hace

- registra a cada familia en una planilla compartida;
- impide una segunda reserva activa con el mismo DNI;
- asigna atómicamente el primer recorrido con lugar para todo el grupo;
- contabiliza personas, no formularios, con un máximo de 50 por visita;
- envía un correo de confirmación a la familia y otro, separado y con los datos completos, a la escuela;
- entrega un comprobante imprimible con código único;
- permite consultar la reserva solamente con DNI **y** código;
- limita intentos y mantiene fuera del navegador la clave del backend;
- no publica un panel de administración ni una contraseña en la web.

## Fechas configuradas

Todos los recorridos son a las **16:00 h** y admiten hasta **50 personas**:

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
- `google-apps-script/Code.gs`: cupos, planilla y correos;
- `.env.example`: variables requeridas en Vercel;
- `vercel.json`: función y cabeceras de seguridad.

## Administración

La administración es la propia hoja `Inscripciones` de Google Sheets, accesible solamente para las cuentas con las que se comparta la planilla. Para cancelar una reserva se cambia su columna `Estado` a `Cancelada`; ese cupo vuelve a estar disponible automáticamente.

## Enlace desde la página oficial

Una vez publicado, el encargado del sitio puede agregar:

```html
<a href="https://URL-DEL-PROYECTO.vercel.app">VISITAS</a>
```

