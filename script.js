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
    loadDailyNotes(nuevaFecha);
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

            row.innerHTML = `<div class="time-label" style="${colorStyle}">${time}</div>`;
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
    if (contenedorAcciones) contenedorAcciones.style.display = 'grid'; // Asegúrate que diga 'grid'
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

function confirmCita(id, e) {
    e.stopPropagation();
    const c = dbCitas.find(x => x.id == id);
    if(c) db.collection("citas").doc(id).update({ confirmada: !c.confirmada });
}

async function deleteCita(id, e) {
    e.stopPropagation();
    if(confirm("¿Borrar esta cita?")) await db.collection("citas").doc(id).delete();
}

// --- 6. GESTIÓN DE CLIENTES ---
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
                    <a href="tel:${c.telefono}" class="btn-circle" style="background:#4cd137"><i class="fas fa-phone"></i></a>
                    <a href="https://wa.me/34${c.telefono}" target="_blank" class="btn-circle" style="background:#25d366"><i class="fab fa-whatsapp"></i></a>
                    <button class="btn-circle" style="background:#00a8ff" onclick="verStats('${c.id}')"><i class="fas fa-chart-line"></i></button>
                    <button class="btn-circle" style="background:#ff9f43" onclick="editCli('${c.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-circle" style="background:#ee5d50" onclick="deleteCli('${c.id}')"><i class="fas fa-trash"></i></button>
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
            nombre: document.getElementById('cli-nombre').value.toUpperCase(),
            telefono: document.getElementById('cli-telefono').value,
            tinte: document.getElementById('cli-tinte').value,
            matiz: document.getElementById('cli-matiz').value,
            notas: document.getElementById('cli-notas').value
        };
        try {
            if(id) await db.collection("clientes").doc(id).update(cli);
            else await db.collection("clientes").add(cli);
            closeClienteModal();
        } catch (error) { console.error(error); }
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
        document.getElementById('cliente-modal').style.display = 'block';
    }
}

async function deleteCli(id) {
    if (confirm("¿Eliminar este cliente permanentemente?")) {
        await db.collection("clientes").doc(id).delete();
    }
}

// --- 7. NOTAS Y BLOQUEOS ---
async function saveNote(event) {
    // 1. EVITAR QUE LA APP SE RECARGUE Y TE ECHE A GOOGLE
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const noteInput = document.getElementById('note-text-input');
    const texto = noteInput.value.trim();

    if (!texto) {
        alert("Escribe algo en la nota antes de guardar.");
        return;
    }

    try {
        // 2. GUARDAR EN FIREBASE (Asegúrate de que la colección sea 'dailyNotes')
        // Usamos la fecha actual para que la nota se guarde en el día correcto
        const fechaHoy = document.getElementById('date-picker-side').value; 

        await db.collection("dailyNotes").add({
            texto: texto,
            fecha: fechaHoy,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. LIMPIAR Y CERRAR SIN RECARGAR
        noteInput.value = "";
        closeNoteModal();
        
        // Si tienes una función que refresca la lista de notas, llámala aquí
        if (typeof loadDailyNotes === "function") {
            loadDailyNotes(fechaHoy);
        }

    } catch (error) {
        console.error("Error al guardar la nota:", error);
        alert("No se pudo guardar la nota. Revisa tu conexión.");
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
    // 1. Evitamos que se abra si pulsamos iconos que no sean de edición (aunque ahora los hayamos quitado)
    if (e && e.target.tagName === 'I' && !e.target.classList.contains('fa-edit')) return;
    
    currentCellId = id;
    const esp = id.split('-')[2];
    const dateStr = getLocalDateString(currentDate);
    
    document.getElementById('appointment-form').reset();
    document.getElementById('modal-time-display').innerText = `${time} - E${esp}`;
    
    const citaExistente = dbCitas.find(c => c.fecha === dateStr && c.hora === time && c.espacio == esp);
    
    // --- LÓGICA PARA BOTONES DE TABLET ---
    const contenedorAcciones = document.getElementById('tablet-actions');
    const btnConf = document.getElementById('btn-confirmar-modal');
    const btnBorr = document.getElementById('btn-borrar-modal');

    if (citaExistente) {
        document.getElementById('app-name').value = citaExistente.nombre;
        document.getElementById('app-phone').value = citaExistente.telefono;
        document.getElementById('app-service').value = citaExistente.servicio;
        document.getElementById('app-notes').value = citaExistente.notas;

        // Si la cita existe, mostramos los botones de Confirmar/Borrar y les damos vida
        if (contenedorAcciones) contenedorAcciones.style.display = 'grid';
        
        if (btnConf) {
            btnConf.onclick = (event) => {
                confirmCita(citaExistente.id, event);
                closeModal();
            };
        }
        if (btnBorr) {
            btnBorr.onclick = (event) => {
                deleteCita(citaExistente.id, event).then(() => closeModal());
            };
        }
    } else {
        // Si la celda está vacía, ocultamos los botones de gestión
        if (contenedorAcciones) contenedorAcciones.style.display = 'none';
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
    if (q.length >= 3) {
        buscarCitasProximas(q);
    } else {
        const resCont = document.getElementById('search-results-container');
        if(resCont) resCont.style.display = 'none';
    }
}

// --- 10. ESCUCHAS FIREBASE (TIEMPO REAL) ---

function obtenerCitasFirebase() {
    if (unsubscribeCitas) unsubscribeCitas();
    const dateStr = getLocalDateString(currentDate);
    unsubscribeCitas = db.collection("citas").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
        dbCitas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        buildAgenda();
        if (typeof actualizarEstadisticasAnuales === "function") actualizarEstadisticasAnuales();
    });
}

function obtenerClientesFirebase() {
    db.collection("clientes").onSnapshot((snapshot) => {
        let lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        lista.sort((a, b) => (a.nombre || "").toUpperCase().localeCompare((b.nombre || "").toUpperCase()));
        dbClientes = lista;
        renderClientes();
        const dN = document.getElementById('list-nombres');
        const dT = document.getElementById('list-telefonos');
        if (dN) dN.innerHTML = dbClientes.map(c => `<option value="${c.nombre}">`).join('');
        if (dT) dT.innerHTML = dbClientes.filter(c => c.telefono).map(c => `<option value="${c.telefono}">`).join('');
    });
}

/** 
 * REPARACIÓN: Función unificada de Notas.
 * Usa la colección 'dailyNotes' que es la que configuramos para evitar recargas.
 */
function obtenerNotasFirebase() {
    if (unsubscribeNotas) unsubscribeNotas();
    
    // IMPORTANTE: Asegúrate de que esta fecha coincida con la que ves en el calendario lateral
    const dateStr = getLocalDateString(currentDate);
    
    unsubscribeNotas = db.collection("dailyNotes").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
        dbNotas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const container = document.getElementById('daily-notes-container');
        
        if (!container) return;

        if (snapshot.empty) {
            container.innerHTML = '<p style="font-size:0.7rem; color:#999; text-align:center; padding:10px;">No hay notas hoy</p>';
            return;
        }

        container.innerHTML = dbNotas.map(n => `
            <div class="note-item" style="background:#fff9c4; padding:8px; margin-top:5px; border-radius:10px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center; border:1px solid #f1e689; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <span style="flex:1;">${n.texto}</span>
                <i class="fas fa-trash" onclick="eliminarNota('${n.id}')" style="color:#ee5d50; cursor:pointer; padding:5px;"></i>
            </div>`).join('');
    });
}

/**
 * REPARACIÓN: Función para eliminar notas corregida para apuntar a 'dailyNotes'
 */
async function eliminarNota(id) {
    if (confirm("¿Borrar esta nota?")) {
        try {
            await db.collection("dailyNotes").doc(id).delete();
            // No hace falta recargar, onSnapshot lo detecta solo
        } catch (e) {
            console.error("Error al borrar nota:", e);
            alert("Error al borrar");
        }
    }
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
    if (!(date instanceof Date)) date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// --- 11. GESTIÓN MANUAL DEL BOTÓN DE NOTAS (ANTI-RECARGA) ---
document.addEventListener('DOMContentLoaded', () => {
    const btnNota = document.getElementById('btn-guardar-nota-fijo');
    if (btnNota) {
        btnNota.onclick = async (e) => {
            e.preventDefault(); 
            const input = document.getElementById('note-text-input');
            const texto = input.value.trim();
            const fechaActual = document.getElementById('date-picker-side').value;

            if (!texto) return;

            try {
                await db.collection("dailyNotes").add({
                    texto: texto,
                    fecha: fechaActual,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                input.value = "";
                closeNoteModal();
                // Al usar onSnapshot, la nota aparecerá sola inmediatamente
            } catch (error) {
                console.error("Error al guardar nota:", error);
                alert("Error al conectar con la base de datos");
            }
        };
    }
});
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
    if (!telefono || telefono.length < 3) return; // No busca hasta que haya 3 números
    
    // Buscamos en nuestra base de datos local de clientes
    const clienteEncontrado = dbClientes.find(x => x.telefono === telefono);
    
    if (clienteEncontrado) {
        // Si lo encuentra, rellena el nombre automáticamente
        document.getElementById('app-name').value = clienteEncontrado.nombre;
        
        // Opcional: podrías ponerle un color momentáneo para que veas que lo ha encontrado
        document.getElementById('app-name').style.backgroundColor = "#e8f5e9";
        setTimeout(() => {
            document.getElementById('app-name').style.backgroundColor = "";
        }, 1000);
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
async function buscarCitasProximas(criterio) {
    if (!criterio || criterio.length < 3) {
        document.getElementById('search-results-container').style.display = 'none';
        return;
    }

    const hoyStr = getLocalDateString(new Date());
    const anioActual = new Date().getFullYear();
    const finAnioStr = `${anioActual}-12-31`;

    try {
        const snapshot = await db.collection("citas")
            .where("fecha", ">=", hoyStr)
            .where("fecha", "<=", finAnioStr)
            .get();

        const contenedor = document.getElementById('citas-encontradas-list');
        const panelInfo = document.getElementById('search-results-container');
        contenedor.innerHTML = "";
        
        let encontradas = [];

        snapshot.forEach(doc => {
            const cita = doc.data();
            const nombreCita = (cita.nombre || "").toUpperCase();
            const tlfCita = (cita.telefono || "");
            const busqueda = criterio.toUpperCase();

            if (nombreCita.includes(busqueda) || tlfCita.includes(busqueda)) {
                encontradas.push(cita);
            }
        });

       if (encontradas.length > 0) {
            encontradas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));

            encontradas.forEach(cita => {
                const item = document.createElement('div');
                item.style = "padding:12px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; gap:10px;";
                const fechaCorta = cita.fecha.split('-').reverse().slice(0,2).join('/');
                
                item.innerHTML = `
                    <div style="flex: 1;">
                        <span style="background:#6c5ce7; color:white; padding:2px 6px; border-radius:4px; font-size:0.8rem; font-weight:bold; margin-right:8px;">${fechaCorta}</span>
                        <b style="color:#2d3436;">${cita.hora}h</b>
                        <div style="font-size:0.85rem; color:#666; margin-top:4px; font-weight: 500;">${cita.nombre}</div>
                        <div style="font-size:0.75rem; color:#999;"><i class="fas fa-cut"></i> ${cita.servicio}</div>
                    </div>
                    <div style="text-align:right; display: flex; flex-direction: column; gap: 5px; min-width: 90px;">
                        <span style="color:${cita.confirmada ? '#4cd137' : '#ff9f43'}; font-size:0.65rem; font-weight:800; text-transform: uppercase;">
                            ${cita.confirmada ? 'Confirmada' : 'Pendiente'}
                        </span>
                        <button onclick="goToDate('${cita.fecha}'); cerrarBuscador();" style="background:#6c5ce7; color:white; border:none; padding:6px 4px; border-radius:8px; cursor:pointer; font-size:0.65rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:4px;">
                            <i class="fas fa-calendar-check"></i> IR AL DÍA
                        </button>
                    </div>
                `;
                contenedor.appendChild(item);
            });
            panelInfo.style.display = 'block';
        } else {
            panelInfo.style.display = 'block'; 
            contenedor.innerHTML = `
                <div style="text-align:center; padding:10px 5px; color:#636e72;">
                    <div style="margin-bottom:8px;">
                        <i class="fas fa-search" style="font-size:1.2rem; color:#dfe6e9;"></i>
                        <b style="display:block; font-size:0.9rem; color:#2d3436; margin-top:5px;">Sin citas próximas</b>
                    </div>
                    
                    <div style="background:#f1f2f6; padding:12px; border-radius:12px; border:1px solid #e1e1e1; text-align: left;">
                        <p style="font-size:0.7rem; margin-bottom:8px; font-weight:bold; text-align:center; color:#6c5ce7; text-transform:uppercase;">Agendar: ${criterio}</p>
                        
                        <div style="margin-bottom:8px;">
                            <label style="font-size:0.65rem; color:#7f8c8d; font-weight:bold; margin-left:2px;">FECHA</label>
                            <input type="date" id="new-app-date" value="${getLocalDateString(new Date())}" style="width:100%; padding:6px; border-radius:8px; border:1px solid #ccc; font-size:0.8rem; background:white;">
                        </div>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
                            <div>
                                <label style="font-size:0.65rem; color:#7f8c8d; font-weight:bold; margin-left:2px;">HORA</label>
                                <select id="new-app-time" style="width:100%; padding:6px; border-radius:8px; border:1px solid #ccc; font-size:0.8rem; background:white;">
                                    ${generarOpcionesHoras()}
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.65rem; color:#7f8c8d; font-weight:bold; margin-left:2px;">ESPACIO</label>
                                <select id="new-app-space" style="width:100%; padding:6px; border-radius:8px; border:1px solid #ccc; font-size:0.8rem; background:white;">
                                    <option value="1">E1</option><option value="2">E2</option>
                                    <option value="3">E3</option><option value="4">E4</option>
                                    <option value="5">E5</option><option value="6">E6</option>
                                </select>
                            </div>
                        </div>

                        <button onclick="confirmarNuevaCitaDesdeBusqueda('${criterio}')" style="background:#20bf6b; color:white; border:none; width:100%; padding:10px; border-radius:10px; cursor:pointer; font-weight:800; font-size:0.75rem; display:flex; align-items:center; justify-content:center; gap:6px; transition:0.2s; box-shadow:0 3px 6px rgba(32, 191, 107, 0.2);">
                            <i class="fas fa-plus"></i> AGENDAR AHORA
                        </button>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error en buscador de citas:", error);
    }
}

// --- FUNCIONES DE CONTROL DEL MODAL ---

function abrirBuscadorCitas() {
    const modal = document.getElementById('search-results-container');
    const input = document.getElementById('input-busqueda-citas');
    const lista = document.getElementById('citas-encontradas-list');
    
    if(modal) modal.style.display = 'block';
    if(input) input.value = ""; 
    if(lista) lista.innerHTML = "<p style='text-align:center; color:#999; font-size:0.8rem; padding:20px;'>Escribe nombre o teléfono...</p>";
    
    setTimeout(() => { if(input) input.focus(); }, 100);
}

function cerrarBuscador() {
    const modal = document.getElementById('search-results-container');
    if(modal) modal.style.display = 'none';
}

function ejecutarBusquedaCitas(valor) {
    const criterio = valor.trim().toUpperCase();
    if (criterio.length >= 3) {
        buscarCitasProximas(criterio);
    } else {
        const lista = document.getElementById('citas-encontradas-list');
        if(lista) lista.innerHTML = "";
    }
}
// 1. Función para abrir el modal flotante
function abrirBuscadorCitas() {
    const modal = document.getElementById('search-results-container');
    const input = document.getElementById('input-busqueda-citas');
    const lista = document.getElementById('citas-encontradas-list');
    
    if(modal) modal.style.display = 'block';
    if(input) input.value = ""; 
    if(lista) lista.innerHTML = "<p style='text-align:center; color:#999; font-size:0.8rem; padding:20px;'>Escribe nombre o teléfono para buscar...</p>";
    
    // Ponemos el foco en el input para escribir directo
    setTimeout(() => { if(input) input.focus(); }, 100);
}

// 2. Función para cerrar el modal
function cerrarBuscador() {
    const modal = document.getElementById('search-results-container');
    if(modal) modal.style.display = 'none';
}

// 3. Función puente que conecta el input con tu buscador de Firebase
function ejecutarBusquedaCitas(valor) {
    const criterio = valor.trim().toUpperCase();
    // Solo buscamos si hay 3 o más letras para no saturar Firebase
    if (criterio.length >= 3) {
        buscarCitasProximas(criterio);
    } else {
        const lista = document.getElementById('citas-encontradas-list');
        if(lista) lista.innerHTML = "";
    }
}
function prepararNuevaCitaDesdeBusqueda(nombreBusqueda) {
    // 1. Cerramos el buscador para ver la agenda
    cerrarBuscador();
    
    // 2. Buscamos si el cliente ya existe en tu base de datos para sacar su teléfono
    const cliente = dbClientes.find(c => c.nombre === nombreBusqueda);
    const telefono = cliente ? cliente.telefono : "";

    // 3. Abrimos el modal de cita en el primer hueco libre (Espacio 1) de la hora actual
    // o simplemente en la hora que prefieras por defecto (ej: 09:00)
    const horaDefecto = "09:00";
    const celdaId = `cell-${horaDefecto}-1`;
    
    // Usamos tu función existente para abrir el modal
    openAppModal(celdaId, horaDefecto);

    // 4. Rellenamos los campos automáticamente
    setTimeout(() => {
        document.getElementById('app-name').value = nombreBusqueda;
        document.getElementById('app-phone').value = telefono;
        document.getElementById('app-service').focus(); // Ponemos el foco en servicio para ir rápido
    }, 200);
}
// Genera las horas de 09:00 a 20:00 para el select
// Generador de horas ultra-compacto
function generarOpcionesHoras() {
    let html = "";
    for (let h = 9; h <= 20; h++) {
        ['00', '30'].forEach(m => {
            if (h === 20 && m === '30') return;
            const t = `${h.toString().padStart(2, '0')}:${m}`;
            html += `<option value="${t}">${t}</option>`;
        });
    }
    return html;
}

// Función para procesar la nueva cita
function confirmarNuevaCitaDesdeBusqueda(nombre) {
    const fecha = document.getElementById('new-app-date').value;
    const hora = document.getElementById('new-app-time').value;
    const espacio = document.getElementById('new-app-space').value;

    if(!fecha) return;

    // 1. Cerramos buscador
    cerrarBuscador();

    // 2. Viajamos a la fecha
    const d = fecha.split('-');
    currentDate = new Date(d[0], d[1]-1, d[2]);
    updateDateDisplay();
    obtenerCitasFirebase();

    // 3. Abrimos el modal oficial
    const cellId = `cell-${hora}-${espacio}`;
    openAppModal(cellId, hora);

    // 4. Autorrelleno de datos (si el cliente ya existe en dbClientes)
    setTimeout(() => {
        const inputNombre = document.getElementById('app-name');
        const inputTlf = document.getElementById('app-phone');
        if(inputNombre) inputNombre.value = nombre;
        
        const clienteFound = dbClientes.find(c => c.nombre.toUpperCase() === nombre.toUpperCase());
        if(clienteFound && inputTlf) inputTlf.value = clienteFound.telefono;
        
        document.getElementById('app-service').focus();
    }, 300);
}
// Este bloque gestiona el guardado de notas sin recargas
document.addEventListener('DOMContentLoaded', () => {
    const btnNota = document.getElementById('btn-guardar-nota-fijo');
    
    if (btnNota) {
        btnNota.onclick = async (e) => {
            e.preventDefault(); // BLOQUEO ANTI-RECARGA
            
            const input = document.getElementById('note-text-input');
            const texto = input.value.trim();
            // Cogemos la fecha que esté marcada en el calendario de la izquierda
            const fecha = document.getElementById('date-picker-side').value;

            if (!texto) return;

            try {
                // GUARDAR EN FIREBASE
                await db.collection("dailyNotes").add({
                    texto: texto,
                    fecha: fecha,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log("Nota guardada");
                input.value = ""; // Limpiar el texto
                closeNoteModal(); // Cerrar ventana
                
                // REFRESCAR LA LISTA (Llamamos a tu función de carga)
                if (typeof loadDailyNotes === 'function') {
                    loadDailyNotes(fecha);
                }

            } catch (error) {
                console.error("Error al guardar nota:", error);
                alert("Error al conectar con la base de datos");
            }
        };
    }
});
// FUNCIÓN PARA LEER LAS NOTAS DE FIREBASE Y PINTARLAS EN EL SIDEBAR
async function loadDailyNotes(fecha) {
    const container = document.getElementById('daily-notes-container');
    if (!container) return;

    try {
        // Buscamos en Firebase las notas de la fecha seleccionada
        const snapshot = await db.collection("dailyNotes")
            .where("fecha", "==", fecha)
            .orderBy("createdAt", "asc")
            .get();

        container.innerHTML = ""; // Limpiamos lo que hubiera antes

        if (snapshot.empty) {
            container.innerHTML = '<p style="font-size:0.7rem; color:#999; text-align:center;">No hay notas hoy</p>';
            return;
        }

        snapshot.forEach(doc => {
            const nota = doc.data();
            const noteHtml = `
                <div class="note-item">
                    <div class="note-text">${nota.texto}</div>
                    <button class="delete-note-btn" onclick="deleteNote('${doc.id}', '${fecha}')">&times;</button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', noteHtml);
        });
    } catch (error) {
        console.error("Error cargando notas:", error);
    }
}

// FUNCIÓN PARA BORRAR UNA NOTA
async function deleteNote(id, fecha) {
    if (confirm("¿Borrar esta nota?")) {
        try {
            await db.collection("dailyNotes").doc(id).delete();
            loadDailyNotes(fecha); // Recargamos la lista
        } catch (error) {
            alert("Error al borrar");
        }
    }
}