// --- 1. CONFIGURACIÓN Y ESTADO ---
const provider = new firebase.auth.GoogleAuthProvider();
let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);
let isLogged = false;
let currentCellId = null;
let dbCitas = [];
let dbClientes = [];
let dbNotas = [];
let dbBloqueos = [];
let dbUsuarios = [];
let unsubscribeCitas = null;
let unsubscribeNotas = null;

// --- 2. VIGILANTE DE ACCESO (GOOGLE) ---
firebase.auth().onAuthStateChanged((user) => {
    const MI_CORREO = "salonherrera50@gmail.com";

    if (user && user.email === MI_CORREO) {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';
        
        iniciarEscuchasFirebase();
        showTab('agenda');
        updateDateDisplay();
        solicitarPermisos();
    } else {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'flex';
        
        if (user) {
            alert("Acceso denegado: " + user.email);
            firebase.auth().signOut();
        }
    }
});

const loginBtn = document.getElementById('google-login-btn');
if (loginBtn) {
    loginBtn.onclick = () => {
        firebase.auth().signInWithPopup(provider)
            .then(() => console.log("Login exitoso"))
            .catch(e => {
                console.error("Error Login:", e);
                alert("Error al acceder con Google: " + e.message);
            });
    };
}

function iniciarEscuchasFirebase() {
    obtenerCitasFirebase();
    obtenerClientesFirebase();
    obtenerNotasFirebase();
    obtenerBloqueosFirebase();
    obtenerUsuariosFirebase();
    obtenerRecurrentesFirebase();
    
    activarVigilanteWeb(); // <--- AÑADE ESTA LÍNEA AQUÍ
}

// --- 3. NAVEGACIÓN Y CALENDARIO ---
function showTab(tabId) {
    // 1. EL BLOQUEO: Si el destino NO es gestion, forzamos el cierre de sesión administrativa
    if (tabId !== 'gestion') {
        isLogged = false;
        // Opcional: Limpiamos los campos de texto por si acaso no se limpiaron antes
        if(document.getElementById('login-user')) document.getElementById('login-user').value = "";
        if(document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
    }

    // 2. Gestión visual de pestañas (Lo que ya tenías)
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if(targetTab) targetTab.style.display = 'block';
    
    const targetBtn = document.getElementById('btn-nav-' + tabId);
    if(targetBtn) targetBtn.classList.add('active');

    // 3. Lógica específica de la pestaña Gestión
    if (tabId === 'gestion') {
        if (isLogged) {
            // Si es true (porque acabas de loguearte con éxito), entras al panel
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            renderBlocks();
            renderUsers();
            actualizarEstadisticasAnuales().catch(err => console.log("Error stats:", err));
        } else {
            // Si es false (porque vienes de otra pestaña), te manda al login SIEMPRE
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('admin-panel').style.display = 'none';
        }
    }
}

function goToDate(dateValue) {
    if (!dateValue) return;
    const parts = dateValue.split('-');
    currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
    updateDateDisplay();
    obtenerCitasFirebase();
    obtenerNotasFirebase();
}

function changeDate(d) {
    currentDate.setDate(currentDate.getDate() + d);
    updateDateDisplay();
    obtenerCitasFirebase();
    obtenerNotasFirebase();
}

function updateDateDisplay() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const titleEl = document.getElementById('agenda-title');
    if (titleEl) titleEl.innerText = currentDate.toLocaleDateString('es-ES', options).toUpperCase();
    
    const picker = document.getElementById('date-picker-side');
    if(picker) picker.value = getLocalDateString(currentDate);

    // --- ACTUALIZACIÓN DEL BOTÓN ---
    const btnHoy = document.getElementById('btn-hoy-rapido');
    if (btnHoy) {
        const hoyStr = getLocalDateString(new Date());
        const seleccionadoStr = getLocalDateString(currentDate);

        if (hoyStr !== seleccionadoStr) {
            // Si NO estamos en el día actual
            btnHoy.style.background = "#ff9f43"; 
            btnHoy.innerHTML = '<i class="fas fa-exclamation-circle"></i> VOLVER A HOY';
            btnHoy.classList.add('btn-alerta-hoy'); // Activa el efecto del CSS
        } else {
            // Si ya estamos en hoy
            btnHoy.style.background = "#6c5ce7";
            btnHoy.innerHTML = '<i class="fas fa-calendar-check"></i> ESTÁS EN HOY';
            btnHoy.classList.remove('btn-alerta-hoy'); // Quita el efecto
        }
    }
}

// --- 4. LÓGICA DE AGENDA ---
function buildAgenda() {
    const container = document.getElementById('agenda-body');
    const dateStr = getLocalDateString(currentDate);
    if(!container) return;
    container.innerHTML = '';

    const hoy = dbCitas.filter(c => c.fecha === dateStr);
    
    const soloClientes = hoy.filter(c => {
        const nombreLimpio = c.nombre ? c.nombre.trim().toUpperCase() : "";
        const esBloqueo = nombreLimpio === "BLOQUEADO" || c.esBloqueo === true;
        return !esBloqueo;
    });

    const bloqueosHoy = dbBloqueos.filter(b => b.fecha === dateStr);
    const diaBloqueadoTotal = bloqueosHoy.find(b => b.tipo === 'full');

    const citasCountEl = document.getElementById('total-citas-count');
    const confCountEl = document.getElementById('confirmadas-count');

    if (citasCountEl) citasCountEl.innerText = soloClientes.length; 
    if (confCountEl) confCountEl.innerText = soloClientes.filter(c => c.confirmada).length;

    for (let h = 9; h <= 20; h++) {
        for (let m of ['00', '30']) {
            if (h === 20 && m === '30') break;
            const time = `${h.toString().padStart(2, '0')}:${m}`;
            const row = document.createElement('div');
            row.className = 'agenda-row';
            
            const enHora = hoy.filter(c => c.hora === time).length;
            let colorStyle = (enHora >= 6) ? 'background:#ee5d50; color:white; border-radius:5px;' : (enHora >= 4 ? 'background:#ff9f43; color:white; border-radius:5px;' : '');

            row.innerHTML = `<div class="time-label sticky-col" style="${colorStyle}">${time}</div>`;
            const bloqParcial = bloqueosHoy.find(b => b.tipo === 'partial' && time >= b.inicio && time < b.fin);

            for (let i = 1; i <= 6; i++) {
                const cellId = `cell-${time}-${i}`;
                const cell = document.createElement('div');
                cell.className = 'slot-cell';
                cell.id = cellId;

                if (diaBloqueadoTotal || bloqParcial) {
                    cell.style.background = "#f2f2f2";
                    cell.innerHTML = '<div style="font-size:0.6rem; color:#ccc; text-align:center; padding-top:35px;"><i class="fas fa-lock"></i></div>';
                } else {
                    cell.onclick = (e) => openAppModal(cellId, time, e);
                    const cita = hoy.find(c => c.hora === time && c.espacio == i);
                    
                    if (cita) {
                        const esBloqueoManual = cita.nombre === "BLOQUEADO" || cita.esBloqueo === true;
                        const esDeWeb = cita.origen === 'web' && !cita.confirmada;
                        
                        let bgColor = esBloqueoManual ? '#57606f' : (cita.confirmada ? '#4cd137' : '#6c5ce7');
                        if (esDeWeb) bgColor = '#e67e22';

                        // --- NUEVA LÓGICA: SOLO PRIMER NOMBRE Y RESALTE DE SERVICIO ---
                        const nombreCompleto = cita.nombre || "";
                        const soloPrimerNombre = nombreCompleto.trim().split(" ")[0];

                       cell.innerHTML = `
    <div class="occupied clickable-card" style="background:${bgColor}; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px;" onclick="openAppModal('${cellId}', '${cita.hora}', event)">
        
        <b onclick="event.stopPropagation(); abrirFichaDesdeCita('${cita.nombre}', '${cellId}', '${cita.hora}')" class="client-name-display">
            ${esBloqueoManual ? '<i class="fas fa-ban"></i> BLOQUEADO' : soloPrimerNombre}
        </b>
        
        <span class="service-text-display">${cita.servicio}</span>
        
        ${cita.notas ? '<div class="note-glow-indicator"></div>' : ''}
        
        ${esDeWeb ? '<div style="position:absolute; top:5px; right:5px; background:white; color:#e67e22; border-radius:50%; width:18px; height:18px; display:flex; align-items:center; justify-content:center; font-size:0.6rem;"><i class="fas fa-globe"></i></div>' : ''}
    </div>`;
                    }
                }
                row.appendChild(cell);
            }
            container.appendChild(row);
        }
    }
}

// --- 5. FUNCIONES DE CITAS Y CLIENTES ---
function abrirFichaDesdeCita(nombreCliente, cellId, hora) {
    const cli = dbClientes.find(c => c.nombre === nombreCliente);
    if(cli) {
        editCli(cli.id);
    } else {
        // Si no está, abrimos el modal de la cita para ver sus datos introducidos
        openAppModal(cellId, hora);
    }
}

async function confirmarCitaWeb(id, e) {
    e.stopPropagation();
    if(confirm("¿Has hablado con el cliente? La cita pasará a ser una GESTIÓN COMPLETADA.")) {
        try {
            await db.collection("citas").doc(id).update({
                origen: 'gestionada', // Esto mueve la cita al contador de "Total Clientes Web"
                confirmada: false     // La mantiene en color morado (pendiente de que llegue al salón)
            });
            
            // ¡ESTO ES LO IMPORTANTE! Actualiza los contadores de gestión al momento
            if (typeof actualizarEstadisticasAnuales === "function") {
                actualizarEstadisticasAnuales();
            }
            
            console.log("Cita gestionada correctamente");
        } catch (error) {
            console.error("Error al gestionar cita web:", error);
            alert("Hubo un error al actualizar la cita.");
        }
    }
}

function quickBlock() {
    const form = document.getElementById('appointment-form');
    
    // Rellenamos los campos como ya hacías
    document.getElementById('app-name').value = "BLOQUEADO";
    document.getElementById('app-phone').value = "000000000";
    document.getElementById('app-service').value = "NO DISPONIBLE";
    document.getElementById('app-notes').value = "Turno bloqueado manualmente";
    
    // ESTA ES LA CLAVE: Añadimos una marca temporal al formulario
    form.dataset.isBlock = "true";
    
    // Disparamos el envío
    form.dispatchEvent(new Event('submit'));
}

const appForm = document.getElementById('appointment-form');
if (appForm) {
    appForm.onsubmit = (e) => {
        e.preventDefault();
        if(!currentCellId) return;
        
        // --- NUEVO: Detectar si es un bloqueo ---
        const esUnBloqueoManual = e.target.dataset.isBlock === "true";
        
        const parts = currentCellId.split('-');
        const hora = parts[1];
        const esp = parts[2];
        
        let nombreRaw = document.getElementById('app-name').value;
        let nombreInput = nombreRaw.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const tlf = document.getElementById('app-phone').value.trim();
        const dateStr = getLocalDateString(currentDate);

        const citaExistente = dbCitas.find(c => c.fecha === dateStr && c.hora === hora && c.espacio == esp);

        // --- MODIFICADO: Añadimos 'esBloqueo' a los datos ---
        const datosCita = {
            fecha: dateStr,
            hora: hora,
            espacio: esp,
            nombre: nombreInput,
            telefono: tlf,
            servicio: document.getElementById('app-service').value,
            notas: document.getElementById('app-notes').value,
            confirmada: citaExistente ? citaExistente.confirmada : false,
            esBloqueo: esUnBloqueoManual // <--- Esto es la clave para las estadísticas
        };

        let promesaCita;
        if (citaExistente) {
            promesaCita = db.collection("citas").doc(citaExistente.id).set(datosCita, { merge: true });
        } else {
            promesaCita = db.collection("citas").add(datosCita);
        }

        promesaCita.then(() => {
            // --- NUEVO: Limpiamos la marca del formulario ---
            e.target.dataset.isBlock = "false";

            if (nombreInput !== "BLOQUEADO" && !esUnBloqueoManual) {
                db.collection("clientes").where("nombre", "==", nombreInput).get()
                .then((snapshot) => {
                    if (!snapshot.empty) {
                        const docId = snapshot.docs[0].id;
                        db.collection("clientes").doc(docId).update({ telefono: tlf });
                    } else {
                        const deseaCrear = confirm(`El cliente "${nombreInput}" no existe. ¿Deseas darlo de alta?`);
                        if (deseaCrear) {
                            openClienteModal();
                            document.getElementById('cli-nombre').value = nombreInput;
                            document.getElementById('cli-telefono').value = tlf;
                            document.getElementById('edit-client-id').value = '';
                        }
                    }
                });
            }
            closeModal();
        }).catch((error) => {
            console.error("Error al guardar:", error);
            alert("Error al guardar: " + error.message);
        });
    };
}

async function confirmCita(id, e) {
    e.stopPropagation();
    const c = dbCitas.find(x => x.id == id);
    if (!c) return;

    const nuevoEstado = !c.confirmada;

    try {
        // 1. Actualizamos en Firebase (Cambia a verde o vuelve al estado original)
        await db.collection("citas").doc(id).update({ confirmada: nuevoEstado });
        console.log("Estado de cita actualizado");

        // 2. Si acabamos de marcarla como CONFIRMADA (verde), comprobamos si es la última
        if (nuevoEstado === true) {
            const notas = c.notas || "";
            
            // ACTUALIZADO: Ahora busca el formato "Sesión X de Y"
            const regex = /Sesión (\d+) de (\d+)/;
            const match = notas.match(regex);

            if (match) {
                const actual = parseInt(match[1]); // Ejemplo: 4
                const total = parseInt(match[2]);  // Ejemplo: 4

                // Si la sesión actual es igual al total (ej: 4 de 4)
                if (actual === total) {
                    // Esperamos 400ms para que la trabajadora vea el cambio de color a verde en la agenda
                    setTimeout(() => {
                        const quiereRenovar = confirm(`¡ATENCIÓN! Acabas de completar la última sesión de ${c.nombre}.\n\n¿Quieres renovar automáticamente otras ${total} semanas con los mismos ajustes?`);
                        
                        if (quiereRenovar) {
                            renovarCitasFijas(c, total);
                        }
                    }, 400);
                }
            }
        }
    } catch (error) {
        console.error("Error al confirmar cita:", error);
        alert("No se pudo actualizar el estado de la cita.");
    }
}

async function deleteCita(id, e) {
    e.stopPropagation();
    if(confirm("¿Borrar esta cita?")) await db.collection("citas").doc(id).delete();
}

// --- 6. GESTIÓN DE CLIENTES ACTUALIZADA ---
function renderClientes(data = dbClientes) {
    const badge = document.getElementById('total-clientes-badge');
    if (badge) badge.innerText = data.length;
    const body = document.getElementById('clientes-list-body');
    if(!body) return;
    body.innerHTML = '';
    
    data.forEach(c => {
        body.innerHTML += `<tr>
            <td><b>${c.nombre}</b></td>
            <td>${c.telefono}</td>
            <td>${c.tinte || '-'}/${c.matiz || '-'}</td>
            <td>
                <div style="display:flex; gap:5px;">
                    <a href="tel:${c.telefono}" class="btn-circle" style="background:#4cd137" title="Llamar"><i class="fas fa-phone"></i></a>
                    <a href="https://wa.me/34${c.telefono}" target="_blank" class="btn-circle" style="background:#25d366" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
                    
                    <!-- NUEVO: BOTÓN HISTORIAL DE PAGOS -->
                    <button class="btn-circle" style="background:#6c5ce7" title="Historial de Pagos" onclick="abrirHistorialPago('${c.id}')">
                        <i class="fas fa-file-invoice-dollar"></i>
                    </button>

                    <button class="btn-circle" style="background:#00a8ff" onclick="verStats('${c.id}')" title="Estadísticas"><i class="fas fa-chart-line"></i></button>
                    <button class="btn-circle" style="background:#ff9f43" onclick="editCli('${c.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-circle" style="background:#ee5d50" onclick="deleteCli('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

const clientForm = document.getElementById('cliente-form');
if (clientForm) {
    clientForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-client-id').value;
    
    const cli = {
        nombre: document.getElementById('cli-nombre').value.toUpperCase().trim(),
        telefono: document.getElementById('cli-telefono').value.trim(),
        tinte: document.getElementById('cli-tinte').value,
        matiz: document.getElementById('cli-matiz').value,
        notas: document.getElementById('cli-notas').value
    };

    try {
        if(id) {
            // MODO EDICIÓN: Se mantiene igual
            await db.collection("clientes").doc(id).update(cli);
        } else {
            // --- NUEVA VALIDACIÓN DE DUPLICADOS ---
            // Buscamos si el teléfono ya existe antes de crear
            const snapshot = await db.collection("clientes")
                .where("telefono", "==", cli.telefono)
                .get();

            if (!snapshot.empty) {
                const existente = snapshot.docs[0].data();
                alert(`Aviso: El cliente "${existente.nombre}" ya está registrado con este teléfono (${cli.telefono}).`);
                return; // Bloquea la creación
            }

            // MODO NUEVO: Manteniendo tus funciones originales
            cli.historial = [];
            cli.fechaAlta = new Date().toISOString();
            await db.collection("clientes").add(cli);
        }
        
        closeClienteModal();
        document.getElementById('edit-client-id').value = "";
    } catch (error) { 
        console.error("Error al guardar cliente:", error);
        alert("Error al guardar los datos.");
    }
};
}

async function editCli(id) {
    const c = dbClientes.find(x => x.id === id);
    if(c) {
        document.getElementById('edit-client-id').value = id;
        document.getElementById('cli-nombre').value = c.nombre;
        document.getElementById('cli-telefono').value = c.telefono;
        document.getElementById('cli-tinte').value = c.tinte || '';
        document.getElementById('cli-matiz').value = c.matiz || '';
        document.getElementById('cli-notas').value = c.notas || '';
        
        const modal = document.getElementById('cliente-modal');
        if(modal) modal.style.display = 'block';
    }
}

async function deleteCli(id) {
    if (confirm("¿Eliminar este cliente permanentemente? Se perderán todos sus datos e historial de notas.")) {
        try {
            await db.collection("clientes").doc(id).delete();
        } catch (error) {
            console.error("Error al eliminar:", error);
        }
    }
}

// --- 7. NOTAS Y BLOQUEOS ---
async function saveNote() {
    const txt = document.getElementById('note-text-input').value;
    if(txt) {
        await db.collection("notas").add({
            // CAMBIO AQUÍ: Usamos tu función local en lugar de toISOString
            fecha: getLocalDateString(currentDate), 
            texto: txt
        });
        document.getElementById('note-text-input').value = "";
        closeNoteModal();
    }
}

async function eliminarNota(id) { if(confirm("¿Borrar nota?")) await db.collection("notas").doc(id).delete(); }

async function saveBlock() {
    const f = document.getElementById('block-date').value;
    if(!f) return;
    await db.collection("bloqueos").add({
        fecha: f,
        tipo: document.getElementById('block-type').value,
        inicio: document.getElementById('block-start').value,
        fin: document.getElementById('block-end').value
    });
    document.getElementById('block-date').value = "";
}

async function eliminarBloqueo(id) { if(confirm("¿Quitar bloqueo?")) await db.collection("bloqueos").doc(id).delete(); }

// --- 8. LOGIN DE ADMINISTRADOR ---
function login() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;

    // Validación de administrador o usuario de la base de datos
    if ((u === "admin" && p === "admin") || dbUsuarios.find(x => x.user === u && x.pass === p)) {
        isLogged = true;
        
        // Limpiamos los inputs para que no se quede la clave escrita al salir y volver a entrar
        document.getElementById('login-user').value = "";
        document.getElementById('login-pass').value = "";
        
        showTab('gestion');
    } else {
        alert("Usuario o contraseña incorrectos");
    }
}
function logout() { isLogged = false; showTab('agenda'); }

// --- 9. MODALES Y AUXILIARES ---
function openAppModal(id, time, e) {
    // 1. Evitamos apertura accidental
    if (e && e.target.tagName === 'I' && !e.target.classList.contains('fa-edit')) return;
    
    currentCellId = id;
    const esp = id.split('-')[2];
    const dateStr = getLocalDateString(currentDate);
    
    // Limpiar formulario
    document.getElementById('appointment-form').reset();
    document.getElementById('modal-time-display').innerText = `${time} - E${esp}`;
    
    const citaExistente = dbCitas.find(c => c.fecha === dateStr && c.hora === time && c.espacio == esp);
    
    const contenedorNueva = document.getElementById('container-nueva');   
    const contenedorSonia = document.getElementById('tablet-actions');    

    if (citaExistente) {
        // --- CASO: CITA YA EXISTENTE ---
        document.getElementById('app-name').value = citaExistente.nombre;
        document.getElementById('app-phone').value = citaExistente.telefono;
        document.getElementById('app-service').value = citaExistente.servicio;
        document.getElementById('app-notes').value = citaExistente.notas;

        if (contenedorSonia) contenedorSonia.style.display = 'grid';
        if (contenedorNueva) contenedorNueva.style.display = 'none';
        
        // Localizamos los 3 botones del contenedor 'tablet-actions'
        const botones = contenedorSonia.querySelectorAll('button');
        const btnAdaptar = botones[0]; // El primer botón (Azul)
        const btnConf = document.getElementById('btn-confirmar-modal'); // Verde
        const btnBorr = document.getElementById('btn-borrar-modal');    // Rojo

        // --- LÓGICA PARA RECUPERAR EL BOTÓN DE ACEPTAR CITA WEB ---
        const esDeWeb = citaExistente.origen === 'web' && !citaExistente.confirmada;

        if (esDeWeb) {
            // TRANSFORMACIÓN: De "ADAPTAR" a "ACEPTAR WEB"
            btnAdaptar.type = "button"; // Evitamos que envíe el formulario por defecto
            btnAdaptar.innerHTML = '<i class="fas fa-check-double" style="font-size: 14px;"></i><span style="font-size: 9px; text-transform: uppercase;">ACEPTAR WEB</span>';
            btnAdaptar.style.background = "#6c5ce7"; // Color lila de gestión
            btnAdaptar.onclick = (event) => {
                confirmarCitaWeb(citaExistente.id, event);
                closeModal();
            };
        } else {
            // RESTAURACIÓN: Volver a ser el botón "ADAPTAR" normal
            btnAdaptar.type = "submit";
            btnAdaptar.innerHTML = '<i class="fas fa-sync-alt" style="font-size: 14px;"></i><span style="font-size: 9px; text-transform: uppercase;">ADAPTAR</span>';
            btnAdaptar.style.background = "#4361ee"; // Tu azul original
            btnAdaptar.onclick = null; 
        }

        // Configurar botón OK (Verde)
        if (btnConf) {
            btnConf.onclick = (event) => {
                // Si tienes la función confirmarCita definida, la llamamos:
                if(typeof confirmCita === 'function') confirmCita(citaExistente.id, event);
                else confirmarCita(); // Según tu HTML llamas a confirmarCita()
                closeModal();
            };
        }

        // Configurar botón BORRAR (Rojo)
        if (btnBorr) {
            btnBorr.onclick = (event) => {
                // Usamos tu función deleteApp() del HTML o deleteCita() del JS
                if(typeof deleteCita === 'function') deleteCita(citaExistente.id, event).then(() => closeModal());
                else deleteApp(); 
            };
        }
    } else {
        // --- CASO: CELDA VACÍA ---
        if (contenedorSonia) contenedorSonia.style.display = 'none';
        if (contenedorNueva) contenedorNueva.style.display = 'block';
    }

    document.getElementById('appointment-modal').style.display = 'block';
}

function closeModal() { document.getElementById('appointment-modal').style.display='none'; }
function openClienteModal() { document.getElementById('edit-client-id').value=''; document.getElementById('cliente-form').reset(); document.getElementById('cliente-modal').style.display='block'; }
function closeClienteModal() { document.getElementById('cliente-modal').style.display='none'; }
function openNoteModal() { document.getElementById('note-modal').style.display='block'; }
function closeNoteModal() { document.getElementById('note-modal').style.display='none'; }

function autoFillPhone(n) {
    const c = dbClientes.find(x => x.nombre === n.toUpperCase());
    if(c) document.getElementById('app-phone').value = c.telefono;
}

function toggleBlockTimes() {
    document.getElementById('block-time-inputs').style.display = document.getElementById('block-type').value === 'partial' ? 'flex' : 'none';
}

function filterClientes() {
    const q = document.getElementById('search-client').value.toUpperCase();
    const filtrados = dbClientes.filter(c => c.nombre.includes(q) || c.telefono.includes(q));
    renderClientes(filtrados);
}

// --- 10. ESCUCHAS FIREBASE (TIEMPO REAL) ---
function obtenerCitasFirebase() {
    if (unsubscribeCitas) unsubscribeCitas();

    const dateStr = getLocalDateString(currentDate);
    unsubscribeCitas = db.collection("citas").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
        dbCitas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 1. Dibuja la agenda del día (lo que ya hacía)
        buildAgenda();

        // 2. NUEVO: Lanza la actualización de las estadísticas anuales 
        // para que los contadores de Gestión cambien al instante
        if (typeof actualizarEstadisticasAnuales === "function") {
            actualizarEstadisticasAnuales();
        }
    });
}
function obtenerClientesFirebase() {
    db.collection("clientes").onSnapshot((snapshot) => {
        // 1. Extraemos los datos de Firebase
        let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. ORDENAR: Alfabéticamente por nombre
        lista.sort((a, b) => {
            const nombreA = (a.nombre || "").toUpperCase();
            const nombreB = (b.nombre || "").toUpperCase();
            return nombreA.localeCompare(nombreB);
        });

        // 3. Guardamos en la variable global
        dbClientes = lista;

        // 4. Dibujamos la tabla de la pestaña Clientes
        renderClientes();

        // 5. ACTUALIZAMOS LOS DOS DESPLEGABLES (Datalists)
        const datalistNombres = document.getElementById('list-nombres');
        const datalistTelefonos = document.getElementById('list-telefonos');

        // Llenar sugerencias de Nombres
        if (datalistNombres) {
            datalistNombres.innerHTML = dbClientes
                .map(c => `<option value="${c.nombre}">`)
                .join('');
        }
        
        // Llenar sugerencias de Teléfonos (NUEVO)
        if (datalistTelefonos) {
            datalistTelefonos.innerHTML = dbClientes
                .filter(c => c.telefono) // Solo si el cliente tiene teléfono
                .map(c => `<option value="${c.telefono}">`)
                .join('');
        }
    });
}

function obtenerNotasFirebase() {
    if (unsubscribeNotas) unsubscribeNotas();

    const dateStr = getLocalDateString(currentDate);
    unsubscribeNotas = db.collection("notas").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
        dbNotas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const container = document.getElementById('daily-notes-container');
        if(container) container.innerHTML = dbNotas.map(n => `
            <div class="note-item" style="background:#fff9c4; padding:8px; margin-top:5px; border-radius:5px; font-size:0.75rem; display:flex; justify-content:space-between; border:1px solid #f1e689;">
                <span>${n.texto}</span>
                <i class="fas fa-trash" onclick="eliminarNota('${n.id}')" style="color:red; cursor:pointer;"></i>
            </div>`).join('');
    });
}

function obtenerBloqueosFirebase() {
    db.collection("bloqueos").onSnapshot((snapshot) => {
        dbBloqueos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBlocks();
        buildAgenda();
    });
}

function obtenerUsuariosFirebase() {
    db.collection("usuarios").onSnapshot((snapshot) => {
        dbUsuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUsers();
    });
}

function renderUsers() {
    const list = document.getElementById('users-admin-list');
    if(list) list.innerHTML = dbUsuarios.map(u => `<div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #eee;"><span>${u.user}</span><i class="fas fa-trash" onclick="eliminarUsuario('${u.id}')" style="color:red; cursor:pointer;"></i></div>`).join('');
}

function renderBlocks() {
    const list = document.getElementById('active-blocks-list');
    if(list) list.innerHTML = dbBloqueos.map(b => `<div style="display:flex; justify-content:space-between; padding:5px; background:#f8f9fa; margin-bottom:5px;"><span>${b.fecha} - ${b.tipo}</span><i class="fas fa-trash" onclick="eliminarBloqueo('${b.id}')" style="color:red; cursor:pointer;"></i></div>`).join('');
}

async function eliminarUsuario(id) { if(confirm("¿Borrar usuario?")) await db.collection("usuarios").doc(id).delete(); }

async function verStats(id) {
    const c = dbClientes.find(x => x.id == id);
    if(!c) return;
    const total = dbCitas.filter(x => x.nombre === c.nombre).length;
    const content = document.getElementById('stats-content');
    if (content) content.innerHTML = `<h3>${c.nombre}</h3><p>Visitas registradas: ${total}</p><hr><p><b>Notas:</b> ${c.notas || 'Sin notas'}</p>`;
    document.getElementById('stats-modal').style.display = 'block';
}

async function purgeAppointments() {
    if(confirm("¡ATENCIÓN! Se borrarán todas las citas de la base de datos. ¿Continuar?")) {
        const snapshot = await db.collection("citas").get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        alert("Base de datos de citas limpiada.");
    }
}

function getLocalDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
// Función para crear administradores (faltaba en tu script)
async function saveUser() {
    const user = document.getElementById('new-user').value.trim();
    const pass = document.getElementById('new-pass').value.trim();
    if(user && pass) {
        try {
            await db.collection("usuarios").add({ user, pass });
            document.getElementById('new-user').value = "";
            document.getElementById('new-pass').value = "";
            alert("Usuario administrador creado con éxito");
        } catch (e) { alert("Error al crear usuario"); }
    } else {
        alert("Por favor, rellena usuario y contraseña");
    }
}

async function actualizarEstadisticasAnuales() {
    const anioActual = new Date().getFullYear().toString();
    const displayYear = document.getElementById('current-year-display');
    if(displayYear) displayYear.innerText = anioActual;

    try {
        // Obtenemos todas las citas de la base de datos
        const snapshot = await db.collection("citas").get();
        const todas = snapshot.docs.map(doc => doc.data());

        // FILTRO MEJORADO
        const delAnio = todas.filter(c => {
            // 1. Validar que tenga fecha y sea de este año
            const esEsteAnio = c.fecha && typeof c.fecha === 'string' && c.fecha.startsWith(anioActual);
            
            // 2. Identificar si es un bloqueo (por nombre o por marca nueva)
            const nombreLimpio = c.nombre ? c.nombre.trim().toUpperCase() : "";
            const esUnBloqueo = (nombreLimpio === "BLOQUEADO" || c.esBloqueo === true);
            
            // Solo queremos lo que sea de este año y NO sea un bloqueo
            return esEsteAnio && !esUnBloqueo;
        });

        // ASIGNACIÓN DE VALORES (con fallback a 0 si no hay datos)
        if(document.getElementById('count-total-anual')) {
            document.getElementById('count-total-anual').innerText = delAnio.length;
        }

        if(document.getElementById('count-confirmadas-anual')) {
            document.getElementById('count-confirmadas-anual').innerText = delAnio.filter(c => c.confirmada === true).length;
        }

        if(document.getElementById('count-web-anual')) {
            document.getElementById('count-web-anual').innerText = delAnio.filter(c => c.origen === 'web' && c.confirmada === false).length;
        }

        if(document.getElementById('count-total-web-anual')) {
            document.getElementById('count-total-web-anual').innerText = delAnio.filter(c => c.origen === 'gestionada').length;
        }

        console.log("Estadísticas actualizadas con", delAnio.length, "citas reales.");

    } catch (error) {
        console.error("Error calculando estadísticas:", error);
    }
}
// Función para que al poner el teléfono sugiera el nombre
function autoFillName(telefono) {
    // 1. Validación de seguridad y longitud mínima
    if (!telefono || telefono.length < 3) return; 
    
    // 2. Buscamos en nuestra base de datos local de clientes
    const clienteEncontrado = dbClientes.find(x => x.telefono === telefono);
    
    if (clienteEncontrado) {
        const inputNombre = document.getElementById('app-name');
        if (!inputNombre) return;

        // 3. Rellena el nombre automáticamente (Mantiene funcionalidad original)
        inputNombre.value = clienteEncontrado.nombre;
        
        // --- MEJORA: Detección de Ficha de Pagos ---
        // Comprobamos si el cliente tiene movimientos en su historial
        const tieneHistorial = clienteEncontrado.historial && clienteEncontrado.historial.length > 0;
        
        // 4. Feedback visual (Verde si es cliente nuevo/sin pagos, Azul si tiene historial)
        inputNombre.style.transition = "background-color 0.5s"; // Suavizamos el cambio
        inputNombre.style.backgroundColor = tieneHistorial ? "#e3f2fd" : "#e8f5e9";
        
        // 5. Limpieza del color tras 1.2 segundos (Mantiene funcionalidad original)
        setTimeout(() => {
            inputNombre.style.backgroundColor = "";
        }, 1200);

        // Opcional: Log en consola para depuración
        console.log(`Cliente detectado: ${clienteEncontrado.nombre} | Historial: ${tieneHistorial ? 'SÍ' : 'NO'}`);
    }
}
// --- FUNCIÓN PARA VOLVER AL DÍA Y HORA ACTUAL ---
function resetearAHoy() {
    // 1. Volvemos a la fecha de hoy
    currentDate = new Date();
    
    // 2. Actualizamos el selector visual y el título de la agenda
    updateDateDisplay();
    
    // 3. Refrescamos los datos desde Firebase para hoy
    obtenerCitasFirebase();
    obtenerNotasFirebase();

    // 4. Hacemos scroll automático a la hora actual
    setTimeout(() => {
        const ahora = new Date();
        const hora = ahora.getHours();
        const minutos = ahora.getMinutes() < 30 ? "00" : "30";
        const tiempoId = `${hora.toString().padStart(2, '0')}:${minutos}`;
        
        // Buscamos la fila que contiene esa hora
        const filas = document.querySelectorAll('.agenda-row');
        let filaDestino = null;

        filas.forEach(fila => {
            if (fila.innerText.includes(tiempoId)) {
                filaDestino = fila;
            }
        });

        if (filaDestino) {
            filaDestino.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Efecto visual momentáneo para indicar dónde estamos
            filaDestino.style.backgroundColor = "rgba(108, 92, 231, 0.1)";
            setTimeout(() => filaDestino.style.backgroundColor = "", 2000);
        }
    }, 500); // Pequeño retraso para dejar que la agenda se dibuje
}
/* ============================================================
   FUNCIONES DEL BUSCADOR GLOBAL DE CITAS
   ============================================================ */

// 1. Abre el modal y pone el foco en el input
// 1. Abre el modal de búsqueda
function openSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) {
        modal.style.display = 'block';
        document.getElementById('global-search-input').value = '';
        document.getElementById('global-search-results').innerHTML = '';
        
        setTimeout(() => {
            const input = document.getElementById('global-search-input');
            if(input) input.focus();
        }, 300);
    }
}

// 2. Cierra el modal de búsqueda
function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.style.display = 'none';
}

// 3. Ejecuta la búsqueda en Firebase
async function ejecutarBusquedaGlobal() {
    const query = document.getElementById('global-search-input').value.toLowerCase().trim();
    const container = document.getElementById('global-search-results');
    
    // 1. Validación de longitud mínima
    if (query.length < 3) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<div style="text-align:center; padding:15px; color:#6c5ce7;"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';

    try {
        // 2. Obtención de datos de citas
        const snapshot = await db.collection("citas").get();
        let resultados = [];
        const hoyString = getLocalDateString(new Date()); 

        snapshot.forEach(doc => {
            const data = doc.data();
            // Buscamos en todo el contenido del documento (nombre, servicio, etc)
            const contenido = JSON.stringify(data).toLowerCase();
            if (contenido.includes(query)) {
                const f = data.fecha || data.Fecha || "";
                const h = data.hora || data.Hora || "";
                let esPasada = (f && f < hoyString);
                resultados.push({ ...data, esPasada, f, h });
            }
        });

        // 3. Botón para crear nueva cita (mantiene funcionalidad original)
        let html = `
            <div onclick="prepararFormularioYCrear('${query.toUpperCase()}')" style="background:#6c5ce7; color:white; padding:14px; border-radius:12px; margin-bottom:15px; cursor:pointer; text-align:center; font-weight:800; box-shadow: 0 4px 12px rgba(108, 92, 231, 0.2); border: 2px solid #fff; text-transform:uppercase;">
                <i class="fas fa-user-plus"></i> NUEVA CITA PARA: ${query}
            </div>
        `;

        if (resultados.length > 0) {
            // Ordenar: primero las próximas, luego las pasadas
            resultados.sort((a, b) => a.esPasada - b.esPasada);
            
            html += resultados.map(cita => {
                const color = cita.esPasada ? '#e74c3c' : '#6c5ce7';
                const fechaCita = cita.f || '---';
                const horaCita = cita.h || '';
                const nombreCita = (cita.nombre || cita.Nombre || "SIN NOMBRE").toUpperCase();

                // --- MEJORA: Vínculo con la Ficha de Pagos ---
                // Buscamos si este nombre de la cita existe en nuestra lista global de clientes
                const clienteRegistrado = dbClientes.find(c => c.nombre.toUpperCase() === nombreCita);
                
                // Si existe el cliente, preparamos un botón de "monedas" para abrir sus notas de pago
                const btnPagoRapido = clienteRegistrado 
                    ? `<button onclick="event.stopPropagation(); abrirHistorialPago('${clienteRegistrado.id}')" 
                               style="background:#2ecc71; color:white; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; margin-right:8px;" 
                               title="Ver Ficha de Pagos">
                           <i class="fas fa-coins"></i>
                       </button>` 
                    : '';

                return `
                    <div onclick="irACitaYSalir('${fechaCita}', '${horaCita}')" 
                         style="background:white; padding:12px; border-radius:10px; margin-bottom:8px; cursor:pointer; border:1px solid #eee; border-left: 5px solid ${color}; transition: transform 0.2s;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center;">
                                ${btnPagoRapido}
                                <div>
                                    <div style="font-weight:bold; text-transform:uppercase; font-size:12px; color:#2d3436;">${nombreCita}</div>
                                    <div style="font-size:10px; color:${color}; font-weight:bold; margin-top:2px;">
                                        ${cita.esPasada ? '<i class="fas fa-history"></i> HISTORIAL' : '<i class="fas fa-calendar-check"></i> PRÓXIMA'}
                                    </div>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="background:${color}; color:white; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:bold;">${fechaCita}</div>
                                <div style="font-size:12px; font-weight:800; margin-top:4px; color:#2d3436;">${horaCita}${horaCita ? 'h' : ''}</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        } else {
            html += `<p style="text-align:center; color:#636e72; font-size:13px; margin-top:10px;">No se encontraron citas previas.</p>`;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error("Error en búsqueda:", error);
        container.innerHTML = '<p style="text-align:center; color:red;">Error al cargar resultados.</p>';
    }
}

// 4. FUNCIÓN CLAVE: Abre el formulario pero permite elegir los datos
// Esta función abre el mini-formulario que acabas de pegar
function prepararFormularioYCrear(nombreParaCita) {
    // 1. Cerramos el buscador (ID: search-modal)
    const buscador = document.getElementById('search-modal');
    if (buscador) buscador.style.display = 'none';

    // 2. Mostramos el mini-formulario rápido (el que pegaste en el index)
    const modalRapido = document.getElementById('modal-cita-rapida');
    if (modalRapido) {
        modalRapido.style.display = 'flex'; 
    }

    // 3. Escribimos el nombre del cliente
    document.getElementById('nombre-cliente-rapido').innerText = nombreParaCita;
    
    // 4. Ponemos fecha de hoy y una hora sugerida
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-rapida').value = hoy;
    document.getElementById('hora-rapida').value = "10:00";
}

// Esta función es la que guarda los datos en Firebase al dar al botón lila
async function guardarCitaRapida() {
    const nombre = document.getElementById('nombre-cliente-rapido').innerText;
    const fecha = document.getElementById('fecha-rapida').value;
    const hora = document.getElementById('hora-rapida').value;
    const turnoSeleccionado = document.getElementById('turno-rapido').value; // Ejemplo: "E3"

    if (!fecha || !hora) {
        alert("¡Ojo! Te falta seleccionar la fecha o la hora.");
        return;
    }

    // EXTRAEMOS EL NÚMERO: Tu agenda necesita el número (1 al 6) no el texto "E1"
    const numeroEspacio = turnoSeleccionado.replace('E', '');

    try {
       await db.collection("citas").add({
            nombre: nombre.toUpperCase(),
            fecha: fecha,
            hora: hora,
            espacio: numeroEspacio,
            telefono: "---",
            servicio: "CITA RÁPIDA",
            confirmada: false,
            esBloqueo: false,
            notificado: true, // <--- AÑADE ESTO: Evita que el iPhone te avise de algo que estás haciendo tú
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('modal-cita-rapida').style.display = 'none';
        
        const inputBusca = document.getElementById('global-search-input');
        if(inputBusca) inputBusca.value = '';

        alert("¡Cita confirmada!");
        
        // REFRESCAR: Usamos buildAgenda que es la función que ya tienes
        if (typeof buildAgenda === 'function') {
            buildAgenda(); 
        } else {
            location.reload(); 
        }

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar.");
    }
}
// 6. FUNCIÓN PARA IR A UNA CITA EXISTENTE DESDE EL BUSCADOR
async function irACitaYSalir(fechaCita, horaCita) {
    // 1. Cerramos el buscador
    closeSearchModal();

    // 2. Convertimos la fecha de la cita (YYYY-MM-DD) a objeto Date
    const partes = fechaCita.split('-');
    // Usamos el constructor con números para evitar problemas de zona horaria
    currentDate = new Date(partes[0], partes[1] - 1, partes[2]);

    // 3. Actualizamos el título y el selector de fecha visualmente
    updateDateDisplay();

    // 4. Cargamos los datos de ese día desde Firebase
    // Esto disparará automáticamente buildAgenda() gracias al onSnapshot
    obtenerCitasFirebase();
    obtenerNotasFirebase();

    // 5. Scroll automático hasta la hora de la cita
    // Le damos un pequeño tiempo (500ms) para que la agenda se dibuje primero
    setTimeout(() => {
        const filas = document.querySelectorAll('.agenda-row');
        let filaDestino = null;

        filas.forEach(fila => {
            // Buscamos la fila que tenga el texto de la hora (ej: "10:30")
            if (fila.innerText.includes(horaCita)) {
                filaDestino = fila;
            }
        });

        if (filaDestino) {
            filaDestino.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Opcional: Resaltamos la fila un momento para que sepa cuál es
            filaDestino.style.backgroundColor = "rgba(108, 92, 231, 0.2)";
            setTimeout(() => {
                filaDestino.style.backgroundColor = "";
            }, 2500);
        }
    }, 600);
}
// --- SISTEMA DE CLIENTAS FIJAS (OPTIMIZADO) ---
let dbRecurrentes = [];

// 1. ESCUCHA DE FIJAS
function obtenerRecurrentesFirebase() {
    console.log("Iniciando escucha de clientas fijas...");
    db.collection("recurrentes").onSnapshot((snapshot) => {
        dbRecurrentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Clientas fijas cargadas:", dbRecurrentes.length);
        renderRecurrentesList(); 
    }, (error) => {
        console.error("Error en Snapshot recurrentes:", error);
    });
}

// 2. GUARDAR Y GENERAR (VERSIÓN CON ASIGNACIÓN DINÁMICA DE 6 ESPACIOS)
async function guardarYGenerarFija() {
    // 1. Captura de elementos
    const elIdEdicion = document.getElementById('edit-rec-id');
    const elNombre = document.getElementById('rec-nombre');
    const elDia = document.getElementById('rec-dia');
    const elHora = document.getElementById('rec-hora');
    const elEspacio = document.getElementById('rec-espacio');
    const elSemanas = document.getElementById('rec-semanas');

    if (!elNombre || !elHora) return alert("Error: No se encuentran los campos en el HTML");

    const idEdicion = elIdEdicion ? elIdEdicion.value : "";
    const nombre = elNombre.value.toUpperCase().trim();
    const dia = parseInt(elDia.value);
    const hora = elHora.value;
    const espacioPreferido = elEspacio.value; 
    const semanas = elSemanas ? parseInt(elSemanas.value) : 1;

    if (!nombre || !hora) {
        alert("Por favor, introduce el nombre y la hora.");
        return;
    }

    const cliente = dbClientes.find(c => c.nombre === nombre);
    const telefono = cliente ? cliente.telefono : "---";

    try {
        if (idEdicion) {
            // --- MODO EDICIÓN ---
            console.log(`Actualizando ficha de ${nombre}...`);
            
            await db.collection("recurrentes").doc(idEdicion).update({
                nombre: nombre,
                telefono: telefono,
                diaSemana: dia,
                hora: hora,
                espacio: espacioPreferido,
                ultimaEdicion: new Date().toISOString()
            });

            elIdEdicion.value = "";
            const btnPrincipal = document.querySelector('button[onclick="guardarYGenerarFija()"]');
            if (btnPrincipal) {
                btnPrincipal.innerHTML = '<i class="fas fa-magic"></i> GUARDAR Y GENERAR CITAS';
                btnPrincipal.style.background = "#6c5ce7";
            }
            const rowSemanas = elSemanas.closest('.field');
            if (rowSemanas) rowSemanas.style.display = 'block';

            alert("Ficha de clienta fija actualizada correctamente.");

        } else {
            // --- MODO CREACIÓN ---
            console.log(`Iniciando proceso nuevo para ${nombre}...`);

            await db.collection("recurrentes").add({
                nombre: nombre,
                telefono: telefono,
                diaSemana: dia,
                hora: hora,
                espacio: espacioPreferido,
                servicio: "CITA FIJA",
                fechaAlta: new Date().toISOString()
            });

            let creadas = 0;
            let ocupadasCompletamente = 0;
            let hoy = new Date();

            for (let s = 0; s < semanas; s++) {
                let fechaCita = new Date();
                fechaCita.setDate(hoy.getDate() + (s * 7));
                
                const diaActual = fechaCita.getDay();
                const diferencia = (dia - diaActual + 7) % 7;
                fechaCita.setDate(fechaCita.getDate() + diferencia);
                
                const dateStr = getLocalDateString(fechaCita);

                let espacioAsignado = null;

                // 1. Intentamos primero el espacio preferido
                const snapshotPreferido = await db.collection("citas")
                    .where("fecha", "==", dateStr)
                    .where("hora", "==", hora)
                    .where("espacio", "==", espacioPreferido)
                    .get();

                if (snapshotPreferido.empty) {
                    espacioAsignado = espacioPreferido;
                } else {
                    // 2. Buscamos en los otros espacios (del 1 al 6)
                    for (let e = 1; e <= 6; e++) {
                        let espacioString = e.toString();
                        if (espacioString === espacioPreferido) continue;

                        const snapshotAlt = await db.collection("citas")
                            .where("fecha", "==", dateStr)
                            .where("hora", "==", hora)
                            .where("espacio", "==", espacioString)
                            .get();

                        if (snapshotAlt.empty) {
                            espacioAsignado = espacioString;
                            break; 
                        }
                    }
                }

                if (espacioAsignado) {
                    // --- NUEVO TEXTO DE NOTAS MÁS CLARO ---
                    const numSesion = s + 1;
                    const esUltima = (numSesion === semanas) ? " - ¡ÚLTIMA SESIÓN!" : "";
                    const notaReubicada = (espacioAsignado !== espacioPreferido) ? " (Reubicada)" : "";
                    
                    const textoNota = `CITA FIJA: Sesión ${numSesion} de ${semanas}${esUltima}${notaReubicada}`;

                    await db.collection("citas").add({
                        nombre: nombre,
                        telefono: telefono,
                        servicio: "CITA FIJA",
                        fecha: dateStr,
                        hora: hora,
                        espacio: espacioAsignado,
                        confirmada: false,
                        esBloqueo: false,
                        notas: textoNota, // Aquí aplicamos el cambio
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    creadas++;
                } else {
                    ocupadasCompletamente++;
                }
            }

            let msg = `¡Éxito! Clienta guardada y ${creadas} citas creadas.`;
            if (ocupadasCompletamente > 0) {
                msg += `\n\nAtención: ${ocupadasCompletamente} citas no se crearon por falta de espacio.`;
            }
            alert(msg);
        }

        elNombre.value = "";
        if(typeof buildAgenda === 'function') buildAgenda();

    } catch (e) {
        console.error("Error íntegro:", e);
        alert("Error crítico: " + e.message);
    }
}

// 3. RENDERIZADO DE LISTA
// --- SISTEMA DE CLIENTAS FIJAS CON EDICIÓN ---

function renderRecurrentesList() {
    const container = document.getElementById('lista-recurrentes');
    if (!container) {
        console.warn("No se encontró el contenedor 'lista-recurrentes'");
        return;
    }
    
    const diasLabels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    
    if (dbRecurrentes.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:20px; background:#f9f9f9; border-radius:10px;">No hay clientas fijas configuradas.</div>';
        return;
    }

    let html = `
    <div class="table-card" style="overflow-x:auto;">
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse; min-width:400px;">
            <thead>
                <tr style="background:#f8f9fa; border-bottom:2px solid #6c5ce7; color:#2d3436; text-align:left;">
                    <th style="padding:12px;">CLIENTA</th>
                    <th style="padding:12px;">DÍA</th>
                    <th style="padding:12px;">HORA</th>
                    <th style="padding:12px;">E</th>
                    <th style="padding:12px; text-align:right;">ACCIONES</th>
                </tr>
            </thead>
            <tbody>`;
    
    dbRecurrentes.forEach(r => {
        html += `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;"><strong>${r.nombre}</strong><br><small style="color:#666">${r.telefono || '---'}</small></td>
            <td style="padding:10px;">${diasLabels[r.diaSemana]}</td>
            <td style="padding:10px;"><span style="background:#e8f0fe; padding:3px 8px; border-radius:5px;">${r.hora}</span></td>
            <td style="padding:10px;">E${r.espacio}</td>
            <td style="padding:10px; text-align:right; white-space:nowrap;">
                <!-- BOTÓN EDITAR (NUEVO) -->
                <button onclick="cargarDatosEdicionFija('${r.id}')" style="background:none; border:none; color:#6c5ce7; cursor:pointer; font-size:1.1rem; margin-right:15px;" title="Editar Ficha">
                    <i class="fas fa-edit"></i>
                </button>
                <!-- BOTÓN ELIMINAR -->
                <button onclick="eliminarRecurrencia('${r.id}')" style="background:none; border:none; color:#ee5d50; cursor:pointer; font-size:1.1rem;" title="Eliminar de la lista">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// FUNCIÓN PARA CARGAR LOS DATOS EN EL FORMULARIO
function cargarDatosEdicionFija(id) {
    const fija = dbRecurrentes.find(r => r.id === id);
    if (!fija) return;

    // 1. Rellenamos los campos del formulario con los datos actuales
    document.getElementById('edit-rec-id').value = fija.id;
    document.getElementById('rec-nombre').value = fija.nombre;
    document.getElementById('rec-dia').value = fija.diaSemana;
    document.getElementById('rec-hora').value = fija.hora;
    document.getElementById('rec-espacio').value = fija.espacio;
    
    // 2. Modificamos el botón principal para que sea de "Actualizar"
    const btnPrincipal = document.querySelector('button[onclick="guardarYGenerarFija()"]');
    if (btnPrincipal) {
        btnPrincipal.innerHTML = '<i class="fas fa-sync-alt"></i> ACTUALIZAR DATOS FIJOS';
        btnPrincipal.style.background = "#2ecc71"; // Cambia a verde
    }

    // 3. Ocultamos el selector de semanas (en edición no solemos querer re-generar todo)
    const rowSemanas = document.getElementById('rec-semanas').closest('.field');
    if (rowSemanas) rowSemanas.style.display = 'none';

    // 4. Scroll suave al formulario
    document.getElementById('rec-nombre').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('rec-nombre').focus();
}

async function eliminarRecurrencia(id) {
    if (confirm("¿Eliminar de la lista de fijas? (Las citas de la agenda se mantienen)")) {
        try {
            await db.collection("recurrentes").doc(id).delete();
        } catch (e) {
            alert("Error al eliminar: " + e.message);
        }
    }
}
// --- FUNCIÓN DE RENOVACIÓN AUTOMÁTICA ---
async function renovarCitasFijas(citaBase, numSemanas) {
    try {
        console.log("Iniciando renovación automática para:", citaBase.nombre);
        
        // La primera cita de la nueva tanda será 7 días después de la cita que acabamos de completar
        let fechaUltimaCita = new Date(citaBase.fecha);
        let creadas = 0;
        const TOTAL_ESPACIOS = 6;

        for (let s = 1; s <= numSemanas; s++) {
            let nuevaFecha = new Date(fechaUltimaCita);
            nuevaFecha.setDate(fechaUltimaCita.getDate() + (s * 7));
            const dateStr = getLocalDateString(nuevaFecha);

            let espacioAsignado = null;

            // 1. Buscamos hueco libre (Prioridad al espacio que ya tenía la clienta)
            const snapPref = await db.collection("citas")
                .where("fecha", "==", dateStr)
                .where("hora", "==", citaBase.hora)
                .where("espacio", "==", citaBase.espacio)
                .get();

            if (snapPref.empty) {
                espacioAsignado = citaBase.espacio;
            } else {
                // 2. Si su sitio está ocupado, escaneamos los 6 espacios
                for (let e = 1; e <= TOTAL_ESPACIOS; e++) {
                    let espStr = e.toString();
                    if (espStr === citaBase.espacio) continue;

                    const snapAlt = await db.collection("citas")
                        .where("fecha", "==", dateStr)
                        .where("hora", "==", citaBase.hora)
                        .where("espacio", "==", espStr)
                        .get();

                    if (snapAlt.empty) {
                        espacioAsignado = espStr;
                        break;
                    }
                }
            }

            if (espacioAsignado) {
                // --- AJUSTE DE NOTA CON EL NUEVO FORMATO ---
                const esUltima = (s === numSemanas) ? " - ¡ÚLTIMA SESIÓN!" : "";
                const notaReubicada = (espacioAsignado !== citaBase.espacio) ? " (Reubicada)" : "";
                
                const textoNota = `CITA FIJA: Sesión ${s} de ${numSemanas}${esUltima}${notaReubicada}`;

                await db.collection("citas").add({
                    nombre: citaBase.nombre,
                    telefono: citaBase.telefono || "---",
                    servicio: "CITA FIJA",
                    fecha: dateStr,
                    hora: citaBase.hora,
                    espacio: espacioAsignado,
                    confirmada: false,
                    esBloqueo: false,
                    notas: textoNota, // Texto amigable para el equipo
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                creadas++;
            }
        }

        alert(`¡Renovación completada!\nSe han generado ${creadas} nuevas citas para ${citaBase.nombre} empezando la próxima semana.`);
        
        // Refrescamos la agenda para que aparezcan las nuevas citas
        if(typeof buildAgenda === 'function') buildAgenda();

    } catch (error) {
        console.error("Error en renovación:", error);
        alert("No se pudo realizar la renovación automática: " + error.message);
    }
}
let clienteActualHistorialId = null;

function abrirHistorialPago(id) {
    clienteActualHistorialId = id;
    const cliente = dbClientes.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('historial-cliente-nombre').innerText = "Notas de " + cliente.nombre;
    
    // Limpiar formulario
    document.getElementById('pago-servicio').value = '';
    document.getElementById('pago-precio').value = '';
    // Poner fecha de hoy por defecto
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('pago-fecha').value = hoy;

    renderTablaHistorial(cliente.historial || []);
    document.getElementById('modal-historial-pago').style.display = 'block';
}

function renderTablaHistorial(historial) {
    const body = document.getElementById('historial-pago-body');
    const totalEl = document.getElementById('historial-total-suma');
    body.innerHTML = '';
    let sumaTotal = 0;

    historial.forEach((item, index) => {
        const precio = parseFloat(item.precio) || 0;
        sumaTotal += precio;
        body.innerHTML += `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #eee;">${item.fecha}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${item.servicio}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;"><b>${precio.toFixed(2)}€</b></td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <button onclick="eliminarLineaHistorial(${index})" style="color:red; background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
    totalEl.innerText = sumaTotal.toFixed(2) + " €";
}

async function guardarNuevaLineaHistorial() {
    const fecha = document.getElementById('pago-fecha').value;
    const servicio = document.getElementById('pago-servicio').value;
    const precio = document.getElementById('pago-precio').value;

    if (!servicio || !precio) return alert("Escribe el servicio y el precio");

    const cliente = dbClientes.find(c => c.id === clienteActualHistorialId);
    const nuevoHistorial = cliente.historial || [];
    
    nuevoHistorial.push({ fecha, servicio: servicio.toUpperCase(), precio: parseFloat(precio) });

    await db.collection("clientes").doc(clienteActualHistorialId).update({ historial: nuevoHistorial });
    
    // Actualizamos la vista local
    renderTablaHistorial(nuevoHistorial);
    document.getElementById('pago-servicio').value = '';
    document.getElementById('pago-precio').value = '';
}

function eliminarLineaHistorial(index) {
    if(!confirm("¿Borrar esta nota?")) return;
    const cliente = dbClientes.find(c => c.id === clienteActualHistorialId);
    const nuevoHistorial = [...cliente.historial];
    nuevoHistorial.splice(index, 1);
    
    db.collection("clientes").doc(clienteActualHistorialId).update({ historial: nuevoHistorial });
    renderTablaHistorial(nuevoHistorial);
}

function cerrarHistorial() {
    document.getElementById('modal-historial-pago').style.display = 'none';
}
function abrirHistorialDesdeFicha() {
    // Obtenemos el ID que está cargado en el campo oculto de la ficha
    const id = document.getElementById('edit-client-id').value;
    
    if (id) {
        closeClienteModal(); // Cerramos la ficha técnica
        
        // Esperamos un instante para que el cierre sea fluido y abrimos los pagos
        setTimeout(() => {
            abrirHistorialPago(id); 
        }, 300);
    } else {
        alert("Selecciona o guarda un cliente primero.");
    }
}
// --- VIGILANTE DE CITAS WEB ---
function activarVigilanteWeb() {
    console.log("Vigilante de citas activado: Esperando nuevas reservas...");
    
    // Escuchamos solo las citas que vienen de la web y que aún no hemos notificado
    db.collection("citas")
        .where("origen", "==", "web")
        .where("notificado", "==", false)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // Si se añade una cita nueva
                if (change.type === "added") {
                    const cita = change.doc.data();
                    const docId = change.doc.id;
                    
                    console.log("¡Cita web detectada! Avisando al iPhone...");
                    
                    // Llamamos a la función que tienes en el index.html
                    if (typeof enviarPushAlIphone === "function") {
                        enviarPushAlIphone(cita.nombre, cita.servicio, cita.hora);
                        
                        // Marcamos como notificada en Firebase para que no vuelva a pitar
                        db.collection("citas").doc(docId).update({ notificado: true })
                          .then(() => console.log("Cita marcada como notificada."))
                          .catch(e => console.error("Error al marcar notificado:", e));
                    }
                }
            });
        });
}
async function enviarAvisoIphone(nombre, servicio, hora) {
    const SERVER_KEY = 'AIzaSyAe1gdkZsrnv5_S7uA6XFh3LKpmEBWeQDY'; // Sustituye por tu clave real

    const payload = {
        "to": "/topics/gestion_pelu",
        "notification": {
            "title": "🆕 ¡CITA AGENDADA!",
            "body": `${nombre} - ${servicio} a las ${hora}`,
            "sound": "default"
        }
    };

    try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${SERVER_KEY}`
            },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error("Error notificación:", e); }
}