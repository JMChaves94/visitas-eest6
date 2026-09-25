(function () {
  "use strict";

  var $ = function (selector, context) {
    return (context || document).querySelector(selector);
  };

  var $$ = function (selector, context) {
    return Array.prototype.slice.call(
      (context || document).querySelectorAll(selector)
    );
  };

  var lastReservation = null;

  function localDate(dateString) {
    var parts = String(dateString).split("-");

    return new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );
  }

  function formatDate(dateString) {
    return new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(localDate(dateString));
  }

  function shortDate(dateString) {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(localDate(dateString));
  }

  function cleanDni(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(
      /[&<>'"]/g,
      function (character) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;"
        }[character];
      }
    );
  }

  async function apiRequest(action, payload) {
    var response;

    try {
      response = await fetch("/api/visitas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          Object.assign(
            {
              action: action
            },
            payload || {}
          )
        )
      });
    } catch (error) {
      throw new Error(
        "No pudimos conectarnos con el sistema. Revisá tu conexión e intentá nuevamente."
      );
    }

    var data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error(
        "El sistema devolvió una respuesta inesperada. Intentá nuevamente."
      );
    }

    if (!response.ok || !data.ok) {
      throw new Error(
        data.message || "No pudimos completar la operación."
      );
    }

    return data;
  }

  function renderAvailability(nextShift) {
    var host = $("#availabilityContent");

    if (!nextShift) {
      host.innerHTML =
        '<h2 id="availableTitle">Sin turnos disponibles</h2>' +
        '<p class="availability-date">' +
        "Todas las reuniones alcanzaron su cupo." +
        "</p>";

      return;
    }

    var used = Number(nextShift.occupied || 0);
    var capacity = Number(nextShift.capacity || 50);
    var percent = Math.min(
      100,
      Math.round((used / capacity) * 100)
    );

    host.innerHTML =
      '<h2 id="availableTitle">' +
      escapeHtml(formatDate(nextShift.date)) +
      "</h2>" +

      '<p class="availability-date">' +
      escapeHtml(nextShift.time) +
      " h · E.E.S.T. N.º 6" +
      "</p>" +

      '<div class="capacity-line">' +
      "<span>Familias registradas</span>" +
      "<strong>" +
      used +
      " / " +
      capacity +
      "</strong>" +
      "</div>" +

      '<div class="progress" aria-label="' +
      percent +
      '% del cupo ocupado">' +
      '<span style="width:' +
      percent +
      '%"></span>' +
      "</div>" +

      '<a class="button button-primary" href="#inscripcion">' +
      "Reservar un turno" +
      "</a>";
  }

  async function loadAvailability() {
    try {
      var result = await apiRequest("status");
      renderAvailability(result.nextShift || null);
    } catch (error) {
      $("#availabilityContent").innerHTML =
        '<h2 id="availableTitle">Cupos no disponibles</h2>' +
        '<p class="availability-date">' +
        escapeHtml(error.message) +
        "</p>";
    }
  }

  function fieldError(field, message) {
    field.classList.toggle("invalid", Boolean(message));

    var wrapper = field.closest(".field");
    var error = wrapper
      ? $(".field-error", wrapper)
      : null;

    if (error) {
      error.textContent = message || "";
    }
  }

  function validateForm(form) {
    var valid = true;

    $$(
      'input:not([name="website"]), select',
      form
    ).forEach(function (field) {
      if (
        field.type === "radio" ||
        field.type === "checkbox"
      ) {
        return;
      }

      var message = "";

      if (
        field.required &&
        !String(field.value).trim()
      ) {
        message = "Este dato es obligatorio.";
      }

      if (
        field.name === "studentDni" &&
        field.value &&
        !/^\d{7,9}$/.test(cleanDni(field.value))
      ) {
        message = "Ingresá un DNI válido, sin puntos.";
      }

      if (
        field.name === "email" &&
        field.value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          field.value
        )
      ) {
        message = "Ingresá un correo válido.";
      }

      fieldError(field, message);

      if (message) {
        valid = false;
      }
    });

    var sibling = form.querySelector(
      'input[name="hasSibling"]:checked'
    );

    var siblingGroup = $(".choice-field", form);

    siblingGroup.classList.toggle(
      "invalid",
      !sibling
    );

    $(".field-error", siblingGroup).textContent =
      sibling
        ? ""
        : "Elegí una opción.";

    if (!sibling) {
      valid = false;
    }

    var consent = form.elements.consent;

    $(".consent-error", form).textContent =
      consent.checked
        ? ""
        : "Necesitamos tu confirmación para registrar la reunión.";

    if (!consent.checked) {
      valid = false;
    }

    return valid;
  }

  function showReceipt(reservation, emailSent) {
    lastReservation = reservation;

    $("#receiptCode").textContent =
      reservation.code;

    $("#receiptDetails").innerHTML =
      "<div>" +
      "<dt>Estudiante</dt>" +
      "<dd>" +
      escapeHtml(reservation.studentName) +
      "</dd>" +
      "</div>" +

      "<div>" +
      "<dt>DNI</dt>" +
      "<dd>" +
      escapeHtml(reservation.studentDni) +
      "</dd>" +
      "</div>" +

      "<div>" +
      "<dt>Fecha</dt>" +
      "<dd>" +
      escapeHtml(shortDate(reservation.date)) +
      "</dd>" +
      "</div>" +

      "<div>" +
      "<dt>Horario</dt>" +
      "<dd>" +
      escapeHtml(reservation.time + " h") +
      "</dd>" +
      "</div>" +

      "<div>" +
      "<dt>Personas</dt>" +
      "<dd>" +
      escapeHtml(reservation.attendees) +
      "</dd>" +
      "</div>" +

      "<div>" +
      "<dt>Responsable</dt>" +
      "<dd>" +
      escapeHtml(reservation.adultName) +
      "</dd>" +
      "</div>";

    var emailStatus = $("#receiptEmailStatus");

    emailStatus.classList.toggle(
      "warning",
      emailSent === false
    );

    emailStatus.textContent =
      emailSent === false
        ? "La reserva quedó guardada, pero el correo no pudo enviarse. Imprimí o anotá este código."
        : "Enviamos la confirmación al correo informado. Los datos quedaron registrados en la planilla de la escuela.";

    $("#successDialog").showModal();
  }

  function setSubmitting(
    button,
    submitting,
    waitingText
  ) {
    if (!button.dataset.originalText) {
      button.dataset.originalText =
        button.textContent;
    }

    button.disabled = submitting;

    button.textContent = submitting
      ? waitingText
      : button.dataset.originalText;
  }

  async function registerFamily(event) {
    event.preventDefault();

    var form = event.currentTarget;

    if (!validateForm(form)) {
      var invalid = $(".invalid", form);

      if (invalid && invalid.focus) {
        invalid.focus();
      }

      return;
    }

    var data = new FormData(form);
    var button = $("#submitButton");

    setSubmitting(
      button,
      true,
      "Registrando…"
    );

    try {
      var result = await apiRequest(
        "register",
        {
          studentName: String(
            data.get("studentName") || ""
          ).trim(),

          studentDni: cleanDni(
            data.get("studentDni")
          ),

          primarySchool: String(
            data.get("primarySchool") || ""
          ).trim(),

          primaryDistrict: String(
            data.get("primaryDistrict") || ""
          ).trim(),

          adultName: String(
            data.get("adultName") || ""
          ).trim(),

          email: String(
            data.get("email") || ""
          )
            .trim()
            .toLowerCase(),

          phone: String(
            data.get("phone") || ""
          ).trim(),

          attendees: Number(
            data.get("attendees")
          ),

          hasSibling: String(
            data.get("hasSibling") || ""
          ),

          website: String(
            data.get("website") || ""
          )
        }
      );

      form.reset();

      showReceipt(
        result.reservation,
        result.emailSent !== false
      );

      loadAvailability();
    } catch (error) {
      toast(error.message);

      if (
        /DNI|reserva activa/i.test(
          error.message
        )
      ) {
        fieldError(
          form.elements.studentDni,
          error.message
        );

        form.elements.studentDni.focus();
      }
    } finally {
      setSubmitting(
        button,
        false,
        ""
      );
    }
  }

  async function lookupReservation(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var data = new FormData(form);
    var host = $("#lookupResult");

    var button = $(
      "button[type=submit]",
      form
    );

    var code = String(
      data.get("lookupCode") || ""
    )
      .trim()
      .toUpperCase();

    if (
      !/^VIS-2026-[A-Z0-9]{4,12}$/.test(
        code
      )
    ) {
      host.innerHTML =
        '<div class="empty-message">' +
        "Revisá el código de reserva." +
        "</div>";

      return;
    }

    host.innerHTML =
      '<div class="lookup-loading">' +
      "Buscando la reserva…" +
      "</div>";

    setSubmitting(
      button,
      true,
      "Buscando…"
    );

    try {
      var result = await apiRequest(
        "lookup",
        {
          code: code
        }
      );

      var reservation =
        result.reservation;

      lastReservation = reservation;

      host.innerHTML =
        '<div class="lookup-card">' +
        "<div>" +

        "<h3>Reserva confirmada para " +
        escapeHtml(
          reservation.studentName
        ) +
        "</h3>" +

        "<p><strong>Fecha:</strong> " +
        escapeHtml(
          formatDate(reservation.date)
        ) +
        "</p>" +

        "<p><strong>Horario:</strong> " +
        escapeHtml(
          reservation.time + " h"
        ) +
        " · <strong>Personas:</strong> " +
        escapeHtml(
          reservation.attendees
        ) +
        "</p>" +

        '<button class="button button-dark lookup-print" type="button">' +
        "Ver comprobante" +
        "</button>" +

        "</div>" +

        '<div class="lookup-code">' +
        escapeHtml(reservation.code) +
        "</div>" +

        "</div>";
    } catch (error) {
      host.innerHTML =
        '<div class="empty-message">' +
        escapeHtml(error.message) +
        "</div>";
    } finally {
      setSubmitting(
        button,
        false,
        ""
      );
    }
  }

  function toast(message) {
    var element = $("#toast");

    element.textContent = message;
    element.classList.add("visible");

    window.clearTimeout(toast.timer);

    toast.timer = window.setTimeout(
      function () {
        element.classList.remove(
          "visible"
        );
      },
      5000
    );
  }

  function bindEvents() {
    $("#registrationForm").addEventListener(
      "submit",
      registerFamily
    );

    $("#lookupForm").addEventListener(
      "submit",
      lookupReservation
    );

    $("#closeDialog").addEventListener(
      "click",
      function () {
        $("#successDialog").close();
      }
    );

    $("#printReceipt").addEventListener(
      "click",
      function () {
        window.print();
      }
    );

    $("#menuButton").addEventListener(
      "click",
      function () {
        var open = $("#mainNav").classList.toggle(
          "open"
        );

        this.setAttribute(
          "aria-expanded",
          String(open)
        );
      }
    );

    $("#mainNav").addEventListener(
      "click",
      function (event) {
        if (event.target.tagName === "A") {
          this.classList.remove("open");

          $("#menuButton").setAttribute(
            "aria-expanded",
            "false"
          );
        }
      }
    );

    document.addEventListener(
      "click",
      function (event) {
        var target =
          event.target.closest("button");

        if (
          target &&
          target.classList.contains(
            "lookup-print"
          ) &&
          lastReservation
        ) {
          showReceipt(
            lastReservation,
            true
          );
        }
      }
    );

    $$(
      "#registrationForm input, #registrationForm select"
    ).forEach(function (field) {
      field.addEventListener(
        "input",
        function () {
          if (
            field.classList.contains(
              "invalid"
            )
          ) {
            fieldError(field, "");
          }
        }
      );
    });
  }

  bindEvents();
  loadAvailability();
})();
