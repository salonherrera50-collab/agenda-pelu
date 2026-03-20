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
}

// --- 4. LÓGICA DE AGENDA ---
function buildAgenda() {
    const container = document.getElementById('agenda-body');
    const dateStr = getLocalDateString(currentDate);
    if(!container) return;
    container.innerHTML = '';

    // 1. Mantenemos 'hoy' con TODO (citas y bloqueos) para que se dibujen en la agenda
    const hoy = dbCitas.filter(c => c.fecha === dateStr);
    
    // 2. NUEVO: Creamos una lista filtrada solo para los contadores numéricos
    const soloClientes = hoy.filter(c => {
        const nombreLimpio = c.nombre ? c.nombre.trim().toUpperCase() : "";
        const esBloqueo = nombreLimpio === "BLOQUEADO" || c.esBloqueo === true;
        return !esBloqueo;
    });

    const bloqueosHoy = dbBloqueos.filter(b => b.fecha === dateStr);
    const diaBloqueadoTotal = bloqueosHoy.find(b => b.tipo === 'full');

    const citasCountEl = document.getElementById('total-citas-count');
    const confCountEl = document.getElementById('confirmadas-count');

    // 3. MODIFICADO: Usamos 'soloClientes' para los numeritos de arriba
    if (citasCountEl) citasCountEl.innerText = soloClientes.length; 
    if (confCountEl) confCountEl.innerText = soloClientes.filter(c => c.confirmada).length;

    for (let h = 9; h <= 20; h++) {
        for (let m of ['00', '30']) {
            if (h === 20 && m === '30') break;
            const time = `${h.toString().padStart(2, '0')}:${m}`;
            const row = document.createElement('div');
            row.className = 'agenda-row';
            
            // Seguimos usando 'hoy' para que el color de la hora y las celdas funcione
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
                        const cId = cita.id || '';
                        const esBloqueoManual = cita.nombre === "BLOQUEADO" || cita.esBloqueo === true;
                        const esDeWeb = cita.origen === 'web' && !cita.confirmada;
                        
                        let bgColor = esBloqueoManual ? '#57606f' : (cita.confirmada ? '#4cd137' : '#6c5ce7');
                        if (esDeWeb) bgColor = '#e67e22';

                        cell.innerHTML = `
                            <div class="occupied" style="background:${bgColor}; color:white; padding:5px; border-radius:6px; font-size:0.75rem; position:relative; height:100%;">
                                <b onclick="event.stopPropagation(); abrirFichaDesdeCita('${cita.nombre}', '${cellId}', '${cita.hora}')" style="cursor:${esBloqueoManual ? 'default' : 'pointer'}; text-decoration:${esBloqueoManual ? 'none' : 'underline'}; color:white;">
                                    ${esBloqueoManual ? '<i class="fas fa-ban"></i> BLOQUEADO' : cita.nombre}
                                </b>
                                <span style="display:block; font-size:0.65rem; opacity:0.9;">${cita.servicio}</span>
                                <div style="position:absolute; top:4px; right:4px; display:flex; gap:8px;">
                                    ${esDeWeb ? `<i class="fas fa-phone-alt" onclick="confirmarCitaWeb('${cId}', event)" style="cursor:pointer; font-size:1.15rem; color:white;" title="Confirmar cita web"></i>` : ''}
                                    ${!esBloqueoManual ? `<i class="fas fa-edit" onclick="openAppModal('${cellId}', '${cita.hora}', event)" style="cursor:pointer; font-size:1.15rem; color:white;"></i>` : ''}
                                    ${!esBloqueoManual ? `<i class="fas fa-check" onclick="confirmCita('${cId}', event)" style="cursor:pointer; font-size:1.15rem;"></i>` : ''}
                                    <i class="fas fa-times" onclick="deleteCita('${cId}', event)" style="cursor:pointer; font-size:1.15rem;"></i>
                                </div>
                                ${cita.notas ? '<i class="fas fa-sticky-note" style="position:absolute; bottom:4px; left:4px; font-size:0.9rem;"></i>' : ''}
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
    if (e && e.target.tagName === 'I' && !e.target.classList.contains('fa-edit')) return;
    
    currentCellId = id;
    const esp = id.split('-')[2];
    const dateStr = getLocalDateString(currentDate);
    
    document.getElementById('appointment-form').reset();
    document.getElementById('modal-time-display').innerText = `${time} - E${esp}`;
    
    const citaExistente = dbCitas.find(c => c.fecha === dateStr && c.hora === time && c.espacio == esp);
    
    if (citaExistente) {
        document.getElementById('app-name').value = citaExistente.nombre;
        document.getElementById('app-phone').value = citaExistente.telefono;
        document.getElementById('app-service').value = citaExistente.servicio;
        document.getElementById('app-notes').value = citaExistente.notas;
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