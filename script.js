// script.js - Wizard completo y optimizado (cliente)
// Reemplaza esta URL por la de tu Web App deploy (exec)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwRsFXUF-g8g9cEv2pjOJ0v47X7jP2w2s72vNbTEYkOtyXKgli_JIaGDKtH2_R1emd8/exec";

// Estado global
let selectedService = "";
let selectedBarbero = "";
let selectedFecha = "";
let selectedHora = "";
let availabilityCache = {}; // cache por barbero
let fechasDisponibles = [];
let fechaIndex = 0;


// Mapea barbero → número de WhatsApp
const BARBER_WHATSAPP = {
  "Carlos": "573001112233",    // ejemplo (código de país sin +)
  "Andrés": "573004445566",
  "Julian": "573007778899"
};


// Refs DOM
let steps = [];
let progressBar, slotsContainer, form, respuestaEl;

document.addEventListener("DOMContentLoaded", init);

function init() {
  steps = [...document.querySelectorAll(".wizard-step")];
  progressBar = document.getElementById("progressBar");
  slotsContainer = document.getElementById("slotsContainer");
  form = document.getElementById("miFormulario");
  respuestaEl = document.getElementById("respuesta");

  // Servicios
  document.querySelectorAll(".service-card").forEach(card => {
    card.addEventListener("click", () => handleServiceSelect(card));
    card.querySelector(".select-service")?.addEventListener("click", e => {
      e.stopPropagation();
      handleServiceSelect(card);
    });
  });

  // Barberos
  document.querySelectorAll(".barber-card").forEach(card => {
    const barber = card.dataset.barber;
    card.addEventListener("click", () => handleBarberSelect(barber));
    // prefetch on hover (no bloquea UI)
    card.addEventListener("mouseenter", () => {
      if (barber && !availabilityCache[barber]) {
        fetchAvailability(barber).then(sl => availabilityCache[barber] = sl).catch(()=>{});
      }
    });
  });

  // Buttons back
  document.getElementById("backToStep1")?.addEventListener("click", () => showStepById("step1"));
  document.getElementById("backToStep2")?.addEventListener("click", () => showStepById("step2"));

  // Form
  form?.addEventListener("submit", submitForm);

    // === init: setup modal admin barberos en el icono Usuario ===
  const openAdminBtn = document.getElementById('openBarberModal');
  if (openAdminBtn) {
    openAdminBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      // renderiza lista si existe la función (la tienes en tu código)
      // if (typeof renderBarberList === 'function') renderBarberList();
      // sincroniza por si hace falta
      if (typeof syncBarbersToStep2 === 'function') syncBarbersToStep2();
      document.getElementById('barberModal').classList.add('show');
    });
  }

  // cerrar modal con botón
  const closeAdminBtn = document.getElementById('closeBarberModal');
  if (closeAdminBtn) {
    closeAdminBtn.addEventListener('click', () => {
      document.getElementById('barberModal').classList.remove('show');
    });
  }

  // cerrar modal al hacer click fuera del contenido
  const barberModalEl = document.getElementById('barberModal');
  if (barberModalEl) {
    barberModalEl.addEventListener('click', (e) => {
      if (e.target === barberModalEl) barberModalEl.classList.remove('show');
    });
  }


  showStepById("step1");
}

// Navegación wizard
function showStepById(id) {
  steps.forEach(s => s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  const idx = steps.findIndex(s => s.id === id);
  if (progressBar && steps.length > 1) {
    progressBar.style.width = `${(idx / (steps.length - 1)) * 100}%`;
  }
}

// Selección servicio
function handleServiceSelect(card) {
  selectedService = card.dataset.name || card.getAttribute('data-name') || card.querySelector("h3")?.innerText || "";
  const campoServicio = document.getElementById("campoServicio");
  if (campoServicio) campoServicio.value = selectedService;
  showStepById("step2");
}

// Selección barbero -> trae disponibilidad (SIEMPRE en vivo para respetar bookings recientes)
async function handleBarberSelect(barber) {
  if (!barber) return;
  selectedBarbero = barber;
  const campoBarbero = document.getElementById("campoBarbero");
  if (campoBarbero) campoBarbero.value = selectedBarbero;

  showStepById("step3");
  slotsContainer.innerHTML = `<div class="no-slots">Cargando disponibilidad…</div>`;

  try {
    // forzar fetch in-vivo (timestamp param para evitar caché)
    const slots = await fetchAvailability(barber, true);
    // cachear la respuesta por si el usuario vuelve al paso 2 y vuelve a seleccionar rápido
    availabilityCache[barber] = slots;
    fechasDisponibles = Object.keys(slots).sort();
    fechaIndex = 0;
    renderDay(slots);
  } catch (err) {
    console.error("Error fetch availability:", err);
    slotsContainer.innerHTML = `<div class="no-slots">❌ No se pudo cargar disponibilidad.</div>`;
  }
}

// Fetch availability helper (t param evita cache del navegador)
const CACHE_TTL = 500; // 1s
let availabilityTimestamps = {};

async function fetchAvailability(barber, force = false) {
  const now = Date.now();

  if (!force && availabilityCache[barber] && 
      availabilityTimestamps[barber] && 
      (now - availabilityTimestamps[barber] < CACHE_TTL)) {
    return availabilityCache[barber];
  }

  const url = `${SCRIPT_URL}?action=getAvailability&barbero=${encodeURIComponent(barber)}&t=${now}`;
  const resp = await fetch(url);
  const json = await resp.json();

  if (!json.ok) throw new Error(json.error || "No data");

  availabilityCache[barber] = json.slots || {};
  availabilityTimestamps[barber] = now;

  return availabilityCache[barber];
}

// Convierte "14:30" → "2:30 PM" Por ejemplo
function toAmPm(timeStr) {
  // timeStr esperado: "HH:mm"
  const [hourStr, minute] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12; // convierte 0 → 12, 13 → 1, etc.
  return `${hour}:${minute} ${ampm}`;
}


// Render solo 1 día con flechas
function renderDay(slotsObj) {
  slotsContainer.innerHTML = "";

  if (!fechasDisponibles || fechasDisponibles.length === 0) {
    slotsContainer.innerHTML = `<div class="no-slots">No hay horarios disponibles</div>`;
    return;
  }

  // mantener index válido
  if (fechaIndex < 0) fechaIndex = 0;
  if (fechaIndex >= fechasDisponibles.length) fechaIndex = fechasDisponibles.length - 1;

  const fecha = fechasDisponibles[fechaIndex];
  const horas = slotsObj[fecha] || [];

  const wrapper = document.createElement("div");
  wrapper.className = "day-wrapper";

  // Nav
  const nav = document.createElement("div");
  nav.className = "week-nav";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "◀";
  prevBtn.disabled = fechaIndex === 0;
  prevBtn.addEventListener("click", () => {
    if (fechaIndex > 0) { fechaIndex--; renderDay(slotsObj); }
  });

  const label = document.createElement("div");
  const dObj = new Date(fecha + "T00:00:00");
  label.textContent = isNaN(dObj) ? fecha : dObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = "▶";
  nextBtn.disabled = fechaIndex === fechasDisponibles.length - 1;
  nextBtn.addEventListener("click", () => {
    if (fechaIndex < fechasDisponibles.length - 1) { fechaIndex++; renderDay(slotsObj); }
  });

  nav.append(prevBtn, label, nextBtn);
  wrapper.appendChild(nav);

  // Hours chips
  const hoursWrap = document.createElement("div");
  hoursWrap.className = "hours";

  if (!horas.length) {
    hoursWrap.innerHTML = `<div class="no-slots">No hay horarios para este día</div>`;
  } else {
    horas.forEach(h => {
      const chip = document.createElement("div");
      chip.className = "slot";
      chip.textContent = toAmPm(h);

      if (selectedFecha === fecha && selectedHora === h) chip.classList.add("selected");

      chip.addEventListener("click", () => {
        hoursWrap.querySelectorAll(".slot.selected").forEach(s => s.classList.remove("selected"));
        chip.classList.add("selected");
        selectedFecha = fecha;
        selectedHora = h;
        const cf = document.getElementById("campoFecha");
        const ch = document.getElementById("campoHora");
        if (cf) cf.value = selectedFecha;
        if (ch) ch.value = selectedHora;
      });

      hoursWrap.appendChild(chip);
    });
  }

  wrapper.appendChild(hoursWrap);
  slotsContainer.appendChild(wrapper);
}

// Submit form
async function submitForm(e) {
  e.preventDefault();
  if (!selectedService || !selectedBarbero || !selectedFecha || !selectedHora) {
    respuestaEl && (respuestaEl.innerText = "⚠️ Selecciona servicio, barbero y horario antes de continuar.");
    return;
  }

  respuestaEl && (respuestaEl.innerText = "Enviando cita…");

  const fd = new FormData(form);
  fd.set("servicio", selectedService);
  fd.set("barbero", selectedBarbero);
  fd.set("fecha", selectedFecha);
  fd.set("hora", selectedHora);
  fd.set("estado", fd.get("estado") || "Pendiente");

  try {
    const res = await fetch(SCRIPT_URL, { method: "POST", body: fd });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { ok:false, error: "Respuesta inválida del servidor" }; }

if (data.ok) {
  // ✅ Mostrar modal de confirmación
  showConfirmModal();

  // Actualizar respuesta en pantalla
  respuestaEl && (respuestaEl.innerText = "✅ Cita registrada con éxito");

  // Quitar slot del cache/UI
  removeSlotFromCache(selectedBarbero, selectedFecha, selectedHora);

  // 📲 Redirigir a WhatsApp del barbero
  const phone = BARBER_WHATSAPP[selectedBarbero];
  if (phone) {
    const mensaje = `Hola ${selectedBarbero}, un cliente ha reservado una cita.\n\n` +
                    `📌 Servicio: ${selectedService}\n` +
                    `📅 Fecha: ${selectedFecha}\n` +
                    `⏰ Hora: ${selectedHora}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
    window.location.href = url;
  } else {
    console.warn("No se encontró número de WhatsApp para:", selectedBarbero);
  }

  // Limpiar formulario / estado
  form.reset();
  selectedService = ""; selectedBarbero = ""; selectedFecha = ""; selectedHora = "";

  // Volver a paso 1 (opcional, ya que redirige)
  showStepById("step1");

} else {

      respuestaEl && (respuestaEl.innerText = "❌ " + (data.error || "Error al registrar"));
    }
  } catch (err) {
    console.error("Error enviar cita:", err);
    respuestaEl && (respuestaEl.innerText = "❌ Error de conexión con el servidor");
  }
}


// Quitar slot del cache / UI luego de reserva
function removeSlotFromCache(barbero, fecha, hora) {
  const cache = availabilityCache[barbero];
  if (!cache) return;
  if (!cache[fecha]) return;
  const idx = cache[fecha].indexOf(hora);
  if (idx > -1) cache[fecha].splice(idx, 1);
  if (cache[fecha].length === 0) delete cache[fecha];

  fechasDisponibles = Object.keys(cache).sort();
  // re-renderizar (pasando cache actual)
  renderDay(cache);
}


// Función para mostrar modal de confirmación
function showConfirmModal() {
  const modal = document.getElementById('confirmModal');
  modal.classList.add('show');

  // Ocultar después de 2 segundos con animación futurista
  setTimeout(() => {
    modal.classList.add('hide');
  }, 2000);

  // Limpiar clases después de la animación para poder reutilizar
  setTimeout(() => {
    modal.classList.remove('show', 'hide');
  }, 2500);
}

// Ejemplo: mostrar modal al enviar el formulari
form?.addEventListener("submit", submitForm);

document.getElementById("openBarberModal").addEventListener("click", (ev) => {
  ev.preventDefault();

  const userModal = document.getElementById("userModal");
  const modalContent = userModal.querySelector('.barber-modal-content');

  // Guardamos contenido original (formulario de agregar barbero)
  const originalFormHTML = modalContent.innerHTML;

  // Contenido del login admin
  modalContent.innerHTML = `
    <button id="closeUserModal" class="close-btn">✖</button>
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;padding:2rem;">
      <h2>Admin Login</h2>
      <input type="password" id="adminPassword" placeholder="Ingresa la contraseña" style="padding:12px;border-radius:12px;border:none;width:100%;max-width:300px;text-align:center;font-size:1rem;">
      <button id="loginAdminBtn" class="btn-glass" style="margin-top:10px;">Ingresar</button>
    </div>
  `;

  userModal.style.display = "flex";

  // Función para cerrar modal
  function attachCloseButton() {
    const closeBtn = modalContent.querySelector('#closeUserModal');
    if(closeBtn){
      closeBtn.addEventListener('click', () => { userModal.style.display = 'none'; });
    }
  }
  attachCloseButton();



  // --- Reactivar listeners del formulario (foto + guardar) ---
function attachFormListeners() {
  const userPhotoInput = document.getElementById("fileInput");
  const avatarPreview = document.getElementById("avatarPreview");
  const avatarWrapper = document.querySelector(".avatar-wrapper");

  if (userPhotoInput) {
    userPhotoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          avatarPreview.src = reader.result;
          avatarPreview.classList.remove("placeholder");
          avatarWrapper.classList.add("has-image");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const guardarBtn = document.getElementById("guardarBarberoBtn");
  if (guardarBtn) {
    guardarBtn.addEventListener("click", guardarBarberoHandler);
  }
}

// --- Lógica de guardar barbero ---
async function guardarBarberoHandler(e) {
  e.preventDefault();

  const nombre = document.getElementById("nombreBarbero").value.trim();
  const dias = document.getElementById("diasDisponibles").value.trim();
  const horario = document.getElementById("horario").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const fotoFile = document.getElementById("fileInput").files[0];

  if (!nombre || !dias || !horario) {
    Swal.fire("⚠️ Campos incompletos", "Debes llenar nombre, días y horario", "warning");
    return;
  }

  const fd = new FormData();
  fd.append("action", "addBarbero");
  fd.append("nombre", nombre);
  fd.append("dias", dias);
  fd.append("horario", horario);
  fd.append("telefono", telefono);
  fd.append("descripcion", descripcion);

  if (fotoFile) {
    const reader = new FileReader();
    reader.onload = async () => {
      fd.append("fotoBase64", reader.result);
      await enviarBarbero(fd);
    };
    reader.readAsDataURL(fotoFile);
  } else {
    await enviarBarbero(fd);
  }
}

// --- función auxiliar para enviar al servidor ---
async function enviarBarbero(fd) {
  try {
    const res = await fetch(SCRIPT_URL, { method: "POST", body: fd });
    const data = await res.json();

    if (data.ok) {
      Swal.fire("✅ Éxito", "Barbero Registrado Correctamente", "success");
      document.getElementById("userModal").style.display = "none";
      if (typeof renderBarberList === "function") renderBarberList();
      if (typeof syncBarbersToStep2 === "function") syncBarbersToStep2();
    } else {
      Swal.fire("❌ Error", data.error || "No se pudo guardar", "error");
    }
  } catch (err) {
    console.error("Error al guardar barbero:", err);
    Swal.fire("❌ Error de conexión", "Intenta nuevamente", "error");
  }
}


  // Login admin
  const loginBtn = document.getElementById('loginAdminBtn');
  loginBtn.addEventListener('click', () => {
    const passwordInput = document.getElementById('adminPassword').value;
    if(passwordInput === '7890') {
      // Contraseña correcta
      Swal.fire({
        title: 'Acceso permitido',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      // Restaurar el formulario original
      modalContent.innerHTML = originalFormHTML;
      attachCloseButton(); // reactivar cerrar modal
      attachFormListeners();

    } else {
      Swal.fire({
        title: 'Contraseña incorrecta',
        icon: 'error'
      });
    }
  });
});


// Cerrar modal
document.getElementById("closeUserModal").addEventListener("click", () => {
  document.getElementById("userModal").style.display = "none";
});

// Previsualizar foto con placeholder +
const userPhotoInput = document.getElementById("fileInput");
const avatarPreview = document.getElementById("avatarPreview");
const avatarWrapper = document.querySelector(".avatar-wrapper");






// Variable global para almacenar el contenido original del formulario
let originalFormHTML = "";

// Guardamos el contenido original al cargar el DOM
window.addEventListener("DOMContentLoaded", () => {
  const modalContent = document.querySelector('#userModal .barber-modal-content');
  if (modalContent) originalFormHTML = modalContent.innerHTML;
});

// Función para reactivar botón de cerrar
function attachCloseButton() {
  const modalContent = document.querySelector('#userModal .barber-modal-content');
  const closeBtn = modalContent.querySelector('#closeUserModal');
  if(closeBtn){
    closeBtn.addEventListener('click', () => {
      document.getElementById('userModal').style.display = 'none';
    });
  }
}

  
// --- renderBarberList corregido ---
async function renderBarberList() {
  try {
    // Llamamos a la Google Sheet vía GAS_URL
    const res = await fetch(`${SCRIPT_URL}?action=getBarbers&t=${Date.now()}`);
    const data = await res.json();
    console.log("Datos de barberos:", data); // depuración

    if (!data.ok || !data.barbers) {
      Swal.fire('Error', 'No se pudo obtener la lista de barberos', 'error');
      return;
    }

    const userModal = document.getElementById('userModal');
    const modalContent = userModal.querySelector('.barber-modal-content');

    // Abrir modal si estaba cerrado
    userModal.style.display = 'flex';

    // Guardamos el contenido original si no existe
    if (!originalFormHTML) originalFormHTML = modalContent.innerHTML;

    // Limpiamos solo el contenido del listado
    modalContent.innerHTML = `
      <button id="closeUserModal" class="close-btn">✖</button>
      <h2>Lista de Barberos</h2>
      <div id="listaBarberos" style="
        display:grid;
        gap:12px;
        margin-top:1rem;
        max-height:400px;
        overflow-y:auto;
      "></div>
    `;

    // Botón cerrar modal
    const closeBtn = modalContent.querySelector('#closeUserModal');
    closeBtn.addEventListener('click', () => {
      userModal.style.display = 'none';
    });

    const listaContainer = document.getElementById('listaBarberos');

    // Crear tarjetas de barbero
    data.barbers.forEach(barber => {
      const card = document.createElement('div');
      card.className = 'barber-card-admin';
      card.innerHTML = `
        <img src="${barber.foto || 'image-path/default.jpg'}" alt="${barber.nombre}">
        <h3>${barber.nombre}</h3>
        <p>${barber.descripcion || ''}</p>
        <p>Días: ${barber.dias || ''} | Horario: ${barber.horario || ''}</p>
        <button class="btn-glass edit-btn" style="background:#ffc107;">Editar</button>
        <button class="delete-btn">Eliminar</button>
      `;

      // Editar barbero
      card.querySelector('.edit-btn').addEventListener('click', () => {
        modalContent.innerHTML = originalFormHTML;
        attachCloseButton();
        attachFormListeners();


        document.getElementById("nombreBarbero").value = barber.nombre;
        document.getElementById("diasDisponibles").value = barber.dias;
        document.getElementById("horario").value = barber.horario;
        document.getElementById("telefono").value = barber.telefono || '';
        document.getElementById("descripcion").value = barber.descripcion || '';

        if (barber.foto) {
          const avatarPreview = document.getElementById("avatarPreview");
          const avatarWrapper = document.querySelector(".avatar-wrapper");
          avatarPreview.src = barber.foto;
          avatarWrapper.classList.add('has-image');
        }
      });

      // Eliminar barbero
      card.querySelector('.delete-btn').addEventListener('click', async () => {
        const confirmDelete = await Swal.fire({
          title: 'Eliminar barbero?',
          text: barber.nombre,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });

        if (confirmDelete.isConfirmed) {
          try {
            const fd = new FormData();
            fd.append('action','deleteBarber');
            fd.append('nombre', barber.nombre);

            const resp = await fetch(SCRIPT_URL, { method:'POST', body:fd });
            const resData = await resp.json();

            if(resData.ok){
              Swal.fire('Eliminado','Barbero eliminado correctamente','success');
              renderBarberList(); // refrescar lista
            } else {
              Swal.fire('Error','No se pudo eliminar','error');
            }
          } catch(err) {
            console.error(err);
            Swal.fire('Error','No se pudo eliminar','error');
          }
        }
      });

      listaContainer.appendChild(card);
    });

  } catch(err) {
    console.error(err);
    Swal.fire('Error','No se pudo cargar la lista de barberos','error');
  }
}

// --- botón para abrir modal con lista ---
document.getElementById('verListaBtn').addEventListener('click', () => {
  renderBarberList();
});



