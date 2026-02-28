// --- 1. CONFIGURACIÓN Y ESTADO ---
const provider = new firebase.auth.GoogleAuthProvider();
let currentDate = new Date();
let isLogged = false; 
let currentCellId = null;
let dbCitas = [];
let dbClientes = [];
let dbNotas = [];
let dbBloqueos = [];
let dbUsuarios = [];

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
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if(targetTab) targetTab.style.display = 'block';
    
    const targetBtn = document.getElementById('btn-nav-' + tabId);
    if(targetBtn) targetBtn.classList.add('active');

    if (tabId === 'gestion') {
        if (isLogged) {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            renderBlocks();
            renderUsers();
        } else {
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
    
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const picker = document.getElementById('date-picker-side');
    if(picker) picker.value = `${yyyy}-${mm}-${dd}`;
}

// --- 4. LÓGICA DE AGENDA ---
function buildAgenda() {
    const container = document.getElementById('agenda-body');
    const dateStr = currentDate.toISOString().split('T')[0];
    if(!container) return;
    container.innerHTML = '';

    const hoy = dbCitas.filter(c => c.fecha === dateStr);
    const bloqueosHoy = dbBloqueos.filter(b => b.fecha === dateStr);
    const diaBloqueadoTotal = bloqueosHoy.find(b => b.tipo === 'full');

    const citasCountEl = document.getElementById('total-citas-count');
    const confCountEl = document.getElementById('confirmadas-count');
    if (citasCountEl) citasCountEl.innerText = hoy.length;
    if (confCountEl) confCountEl.innerText = hoy.filter(c => c.confirmada).length;

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
                        const cli = dbClientes.find(cl => cl.nombre === cita.nombre);
                        const cId = cita.id || '';
                        const esBloqueoManual = cita.nombre === "BLOQUEADO";
                        const bgColor = esBloqueoManual ? '#57606f' : (cita.confirmada ? '#4cd137' : '#6c5ce7');

                        // --- SUSTITUYE EL BLOQUE DENTRO DE buildAgenda ---
// ... (parte inicial de buildAgenda queda igual)
                        cell.innerHTML = `
                            <div class="occupied" style="background:${bgColor}; color:white; padding:5px; border-radius:6px; font-size:0.75rem; position:relative; height:100%;">
                                <b>${esBloqueoManual ? '<i class="fas fa-ban"></i> BLOQUEADO' : cita.nombre}</b>
                                <span style="display:block; font-size:0.65rem; opacity:0.9;">${cita.servicio}</span>
                                
                                <div style="position:absolute; top:4px; right:4px; display:flex; gap:6px;">
                                    ${!esBloqueoManual ? `
                                        <i class="fas fa-edit" onclick="editarCitaExistente('${cId}')" style="cursor:pointer; font-size:1.15rem;" title="Editar cita"></i>
                                        <i class="fas fa-check" onclick="confirmCita('${cId}', event)" style="cursor:pointer; font-size:1.15rem;" title="Confirmar"></i>
                                    ` : ''}
                                    <i class="fas fa-times" onclick="deleteCita('${cId}', event)" style="cursor:pointer; font-size:1.15rem;" title="Borrar"></i>
                                </div>
                                
                                ${cita.notas ? '<i class="fas fa-sticky-note" style="position:absolute; bottom:4px; left:4px; font-size:0.9rem;"></i>' : ''}
                            </div>`;
// ... (resto de buildAgenda queda igual)
                    }
                }
                row.appendChild(cell);
            }
            container.appendChild(row);
        }
    }
}

// --- 5. FUNCIONES DE CITAS ---
function quickBlock() {
    document.getElementById('app-name').value = "BLOQUEADO";
    document.getElementById('app-phone').value = "000000000";
    document.getElementById('app-service').value = "NO DISPONIBLE";
    document.getElementById('app-notes').value = "Turno bloqueado manualmente";
    document.getElementById('appointment-form').dispatchEvent(new Event('submit'));
}
function editarCitaExistente(id) {
    const cita = dbCitas.find(c => c.id === id);
    if (!cita) return;

    // Buscamos la celda correspondiente para obtener su ID (para saber dónde estaba)
    currentCellId = `cell-${cita.hora}-${cita.espacio}`;

    // Rellenamos el modal con los datos de la cita
    document.getElementById('app-name').value = cita.nombre;
    document.getElementById('app-phone').value = cita.telefono;
    document.getElementById('app-service').value = cita.servicio;
    document.getElementById('app-notes').value = cita.notas;
    document.getElementById('modal-time-display').innerText = `${cita.hora} - E${cita.espacio}`;

    // Abrimos el modal
    document.getElementById('appointment-modal').style.display = 'block';
}
// --- SUSTITUYE EL BLOQUE appForm.onsubmit ---
// --- SUSTITUYE EL BLOQUE appForm.onsubmit ---
// --- SUSTITUYE EL BLOQUE appForm.onsubmit ---
// --- SUSTITUYE EL BLOQUE appForm.onsubmit ---
const appForm = document.getElementById('appointment-form');
if (appForm) {
    appForm.onsubmit = (e) => {
        e.preventDefault();
        if(!currentCellId) return;
        
        const parts = currentCellId.split('-');
        const hora = parts[1];
        const esp = parts[2];
        
        let nombreRaw = document.getElementById('app-name').value;
        let nombreInput = nombreRaw.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const tlf = document.getElementById('app-phone').value.trim();
        const dateStr = currentDate.toISOString().split('T')[0];

        const citaExistente = dbCitas.find(c => c.fecha === dateStr && c.hora === hora && c.espacio == esp);

        const datosCita = {
            fecha: dateStr, hora: hora, espacio: esp, nombre: nombreInput,
            telefono: tlf, servicio: document.getElementById('app-service').value,
            notas: document.getElementById('app-notes').value,
            confirmada: citaExistente ? citaExistente.confirmada : false
        };

        // --- LÓGICA DE CITAS ---
        let promesaCita;
        if (citaExistente) {
            promesaCita = db.collection("citas").doc(citaExistente.id).set(datosCita, { merge: true });
        } else {
            promesaCita = db.collection("citas").add(datosCita);
        }

        promesaCita.then(() => {
            // --- LÓGICA DE CLIENTES (Búsqueda Estricta) ---
            if (nombreInput !== "BLOQUEADO") {
                db.collection("clientes").where("nombre", "==", nombreInput).get()
                .then((snapshot) => {
                    if (!snapshot.empty) {
                        // SI EXISTE: Actualizamos teléfono
                        const docId = snapshot.docs[0].id;
                        db.collection("clientes").doc(docId).update({
                            telefono: tlf
                        });
                        console.log("Cliente actualizado:", nombreInput);
                        closeModal(); // Cerrar modal cita
                    } else {
                        // --- CAMBIO AQUÍ: SI NO EXISTE, ABRIMOS MODAL CLIENTE ---
                        if (confirm(`El cliente "${nombreInput}" no está registrado. ¿Deseas darlo de alta ahora?`)) {
                            // 1. Cerrar modal de citas
                            closeModal();
                            
                            // 2. Abrir modal de clientes y rellenar nombre
                            openClienteModal(); 
                            document.getElementById('cli-nombre').value = nombreInput;
                            document.getElementById('cli-telefono').value = tlf;
                            // Opcional: enfocar en el campo teléfono para que lo termine de rellenar
                            document.getElementById('cli-telefono').focus();
                        } else {
                            // Si cancela, cerramos modal cita
                            closeModal();
                        }
                    }
                });
            } else {
                closeModal();
            }
        }).catch((error) => {
            console.error("Error al guardar:", error);
            alert("Error al guardar: " + error.message);
        });
    };
}
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------

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
// --- 6. GESTIÓN DE CLIENTES ---
function renderClientes(data = dbClientes) {
    // ... (este código queda igual)
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

// --- SUSTITUYE EL BLOQUE clientForm.onsubmit ---
const clientForm = document.getElementById('cliente-form');
if (clientForm) {
    clientForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-client-id').value;
        
        // Normalizar nombre igual que en la agenda
        let nombreRaw = document.getElementById('cli-nombre').value;
        let nombreInput = nombreRaw.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const cliData = {
            nombre: nombreInput,
            telefono: document.getElementById('cli-telefono').value.trim(),
            tinte: document.getElementById('cli-tinte').value,
            matiz: document.getElementById('cli-matiz').value,
            notas: document.getElementById('cli-notas').value
        };

        try {
            if (id) {
                // MODO EDICIÓN: Solo actualizar
                await db.collection("clientes").doc(id).update(cliData);
                closeClienteModal();
            } else {
                // MODO CREACIÓN: Verificar duplicados primero
                const snapshot = await db.collection("clientes").where("nombre", "==", nombreInput).get();
                
                if (!snapshot.empty) {
                    alert(`El cliente "${nombreInput}" ya existe en la base de datos.`);
                    // Opcional: Podrías abrir el modal del cliente existente aquí
                    return; // Detiene la ejecución, no crea el cliente
                } else {
                    // No existe, creamos
                    await db.collection("clientes").add(cliData);
                    closeClienteModal();
                }
            }
        } catch (error) { 
            console.error(error); 
            alert("Error al guardar cliente: " + error.message);
        }
    };
}
// -------------------------------------------------------------------------

async function editCli(id) {
    // ... (este código queda igual)
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
    // ... (este código queda igual)
    if (confirm("¿Eliminar este cliente permanentemente?")) {
        await db.collection("clientes").doc(id).delete();
    }
}
// ...

// --- 7. NOTAS Y BLOQUEOS ---
async function saveNote() {
    const txt = document.getElementById('note-text-input').value;
    if(txt) {
        await db.collection("notas").add({
            fecha: currentDate.toISOString().split('T')[0],
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
    if ((u === "admin" && p === "admin") || dbUsuarios.find(x => x.user === u && x.pass === p)) {
        isLogged = true;
        showTab('gestion');
    } else { alert("Usuario o contraseña incorrectos"); }
}

function logout() { isLogged = false; showTab('agenda'); }

// --- 9. MODALES Y AUXILIARES ---
function openAppModal(id, time, e) {
    if (e.target.closest('.occupied') || e.target.tagName === 'B') return;
    
    currentCellId = id;
    const esp = id.split('-')[2];
    const dateStr = currentDate.toISOString().split('T')[0];
    
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
    const dateStr = currentDate.toISOString().split('T')[0];
    db.collection("citas").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
        dbCitas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        buildAgenda();
    });
}

function obtenerClientesFirebase() {
    db.collection("clientes").onSnapshot((snapshot) => {
        dbClientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderClientes();
        const datalist = document.getElementById('list-nombres');
        if (datalist) datalist.innerHTML = dbClientes.map(c => `<option value="${c.nombre}">`).join('');
    });
}

function obtenerNotasFirebase() {
    const dateStr = currentDate.toISOString().split('T')[0];
    db.collection("notas").where("fecha", "==", dateStr).onSnapshot((snapshot) => {
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