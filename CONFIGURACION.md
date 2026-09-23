# Configuración y prueba real

La web y el backend están armados. Estos pasos conectan el proyecto con las cuentas reales de la escuela; no pueden ejecutarse sin iniciar sesión y autorizar Google/Vercel.

## 1. Crear la planilla y activar el backend de Google

1. Entrar con el Gmail que enviará los correos y crear una planilla vacía en Google Sheets.
2. Abrir **Extensiones → Apps Script**.
3. Borrar el contenido del editor y pegar completo `google-apps-script/Code.gs`.
4. En la primera línea, reemplazar:

   ```js
   const CORREO_ESCUELA = "REEMPLAZAR_POR_GMAIL_INSTITUCIONAL";
   ```

   por el correo institucional que debe figurar como dirección de respuesta en las confirmaciones familiares. La escuela no recibe un mensaje por cada inscripción: administra los registros desde la planilla.
5. Guardar. En el selector de funciones elegir `configurarSistema` y presionar **Ejecutar**.
6. Google pedirá permisos para acceder a la planilla y enviar correos. Aceptarlos desde la cuenta de la escuela.
7. Abrir **Registro de ejecución** y copiar el valor completo que aparece después de `BACKEND_SECRET=`. No publicarlo ni pegarlo en el frontend.
8. Elegir **Implementar → Nueva implementación → Aplicación web**.
9. Configurar **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier usuario**. Implementar y copiar la URL terminada en `/exec`.

Que la aplicación web admita solicitudes públicas no expone la planilla: cada solicitud debe incluir el secreto guardado únicamente en Vercel. Los datos se consultan o administran desde la planilla privada.

## 2. Publicar en Vercel

1. Subir esta carpeta a un repositorio o importarla como proyecto nuevo en Vercel.
2. En **Settings → Environment Variables** agregar:

   | Variable | Valor |
   |---|---|
   | `APPS_SCRIPT_URL` | URL `/exec` copiada en el paso anterior |
   | `BACKEND_SECRET` | secreto mostrado por `configurarSistema` |
   | `RATE_LIMIT_SALT` | una cadena aleatoria larga diferente (opcional, recomendado) |

3. Desplegar nuevamente después de guardar las variables.
4. No subir un archivo `.env` con claves al repositorio.

## 3. Prueba TempMail + Gmail

1. Abrir la URL pública de Vercel en una ventana privada.
2. Completar una reserva usando una dirección de TempMail como correo familiar.
3. Al confirmar deben ocurrir las tres cosas siguientes:

   - aparece el comprobante y un código `VIS-2026-...`;
   - se crea una fila completa en `Inscripciones`, incluyendo DNI, correo y teléfono;
   - llega la confirmación a TempMail;

4. Probar **Consultar turno** utilizando solamente el código del comprobante.
5. Para repetir la prueba, cambiar la columna `Estado` de la fila anterior a `Cancelada` o usar otro DNI de prueba.

Cada reserva representa una familia y ocupa uno de los 50 cupos, tanto si asiste una persona como si asisten dos. Revisar también Spam/Correo no deseado. Apps Script tiene una cuota diaria de destinatarios definida por el tipo de cuenta de Google. Si se agota, la reserva igual queda guardada y la columna `Estado correo` indica el fallo.

## Seguridad aplicada

- la clave no se entrega al navegador;
- no hay acceso administrativo público;
- cada inscripción se valida dos veces, en Vercel y en Google;
- un candado evita que dos familias ocupen simultáneamente el último cupo;
- la consulta exige un código de reserva aleatorio y difícil de adivinar;
- hay límite por origen para registros y búsquedas;
- se usa un campo señuelo contra bots;
- Vercel recibe solo una huella anónima del origen; la planilla no almacena IPs.
