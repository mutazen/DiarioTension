import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// CONFIGURACIÓN DE FIREBASE (Usa la tuya propia)
const firebaseConfig = {
    apiKey: "AIzaSyDRJDaRRlcm_PWhVZ6mbgYA-1JRuXalwyk",
    authDomain: "diariotension.firebaseapp.com",
    projectId: "diariotension",
    storageBucket: "diariotension.firebasestorage.app",
    messagingSenderId: "506491746320",
    appId: "1:506491746320:web:bab3475f21264dcc7f3295"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let editId = null;

const formatDate = (date) => {
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const getStatusColor = (sistolica, diastolica) => {
    if (sistolica >= 140 || diastolica >= 90) return '#dc3545';
    if (sistolica >= 130 || diastolica >= 80) return '#ffc107';
    return '#28a745';
};

const formatInputDate = (timestamp) => {
    const date = new Date(timestamp);
    const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localTime.toISOString().slice(0, 16);
};

const showToast = (text, isError = false) => {
    const msg = document.getElementById('msg-aviso');
    msg.innerText = text;
    msg.classList.toggle('error', isError);
    msg.classList.add('show');
    window.clearTimeout(msg.hideTimeout);
    msg.hideTimeout = window.setTimeout(() => {
        msg.classList.remove('show');
    }, 3000);
};

const validateValues = (sistolica, diastolica, pulsaciones) => {
    if (Number.isNaN(sistolica) || Number.isNaN(diastolica) || Number.isNaN(pulsaciones)) {
        showToast('Por favor completa todos los valores numéricos.', true);
        return false;
    }
    if (sistolica < 60 || sistolica > 250 || diastolica < 40 || diastolica > 150) {
        showToast('Ingresa valores de presión arterial válidos.', true);
        return false;
    }
    if (pulsaciones < 30 || pulsaciones > 200) {
        showToast('Ingresa un valor de pulsaciones válido.', true);
        return false;
    }
    return true;
};

const generarODT = async (mediciones, fechaDesde, fechaHasta) => {
    if (mediciones.length === 0) {
        showToast('No hay mediciones para descargar en este rango.', true);
        return;
    }

    const JSZip = window.JSZip;
    const zip = new JSZip();

    // Crear mimetype
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });

    // Crear META-INF/manifest.xml
    const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
 <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
    zip.folder('META-INF').file('manifest.xml', manifestXml);

    // Crear content.xml con la tabla de mediciones
    const filas = mediciones.map(m => `
        <table:table-row>
            <table:table-cell office:value-type="string">
                <text:p>${m.fecha || ''}</text:p>
            </table:table-cell>
            <table:table-cell office:value-type="float" office:value="${m.sistolica}">
                <text:p>${m.sistolica}</text:p>
            </table:table-cell>
            <table:table-cell office:value-type="float" office:value="${m.diastolica}">
                <text:p>${m.diastolica}</text:p>
            </table:table-cell>
            <table:table-cell office:value-type="float" office:value="${m.pulsaciones}">
                <text:p>${m.pulsaciones}</text:p>
            </table:table-cell>
        </table:table-row>`).join('');

    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
 <office:body>
  <office:text>
   <text:p><text:span text:style-name="Title">Reporte de Mediciones de Presión Arterial</text:span></text:p>
   <text:p></text:p>
   <text:p>Período: ${fechaDesde || 'Inicio'} a ${fechaHasta || 'Hoy'}</text:p>
   <text:p>Total de registros: ${mediciones.length}</text:p>
   <text:p></text:p>
   <table:table table:name="Mediciones" table:style-name="Table1">
    <table:table-column table:style-name="co1"/>
    <table:table-column table:style-name="co1"/>
    <table:table-column table:style-name="co1"/>
    <table:table-column table:style-name="co1"/>
    <table:table-header-rows>
     <table:table-row>
      <table:table-cell office:value-type="string" table:style-name="ce1">
       <text:p>Fecha</text:p>
      </table:table-cell>
      <table:table-cell office:value-type="string" table:style-name="ce1">
       <text:p>Sistólica (mmHg)</text:p>
      </table:table-cell>
      <table:table-cell office:value-type="string" table:style-name="ce1">
       <text:p>Diastólica (mmHg)</text:p>
      </table:table-cell>
      <table:table-cell office:value-type="string" table:style-name="ce1">
       <text:p>Pulsaciones (pul/min)</text:p>
      </table:table-cell>
     </table:table-row>
    </table:table-header-rows>
    ${filas}
   </table:table>
  </office:text>
 </office:body>
</office:document-content>`;

    zip.file('content.xml', contentXml);

    // Generar el archivo ODT y descargar
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-mediciones-${new Date().toISOString().split('T')[0]}.odt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✅ Reporte descargado correctamente');
};

window.addEventListener('DOMContentLoaded', () => {
    const screenList = document.getElementById('screen-list');
    const screenForm = document.getElementById('screen-form');
    const screenReports = document.getElementById('screen-reports');
    const header = document.getElementById('header');
    const listaMediciones = document.getElementById('lista-mediciones');
    const emptyState = document.getElementById('empty-state');
    const registroForm = document.getElementById('registro-form');
    const fechaInput = document.getElementById('fecha');
    const sisInput = document.getElementById('sis');
    const diaInput = document.getElementById('dia');
    const pulInput = document.getElementById('pul');
    const submitBtn = registroForm.querySelector('button[type="submit"]');
    const addButton = document.getElementById('btn-add');
    const cancelButton = document.getElementById('btn-cancel');
    const navMediciones = document.getElementById('nav-mediciones');
    const navReportes = document.getElementById('nav-reportes');

    let todasMediciones = [];

    const switchScreen = (screenId) => {
        screenList.style.display = 'none';
        screenForm.style.display = 'none';
        screenReports.style.display = 'none';
        navMediciones.classList.remove('active');
        navReportes.classList.remove('active');

        if (screenId === 'list') {
            screenList.style.display = 'block';
            header.innerText = 'Mis Mediciones';
            navMediciones.classList.add('active');
        } else if (screenId === 'reports') {
            screenReports.style.display = 'block';
            header.innerText = 'Reportes';
            navReportes.classList.add('active');
            updateMedicionesCount();
        } else if (screenId === 'form') {
            screenForm.style.display = 'block';
            header.innerText = 'Nueva Medición';
        }
    };

    const updateMedicionesCount = () => {
        const desde = document.getElementById('fecha-desde').valueAsNumber;
        const hasta = document.getElementById('fecha-hasta').valueAsNumber;
        
        if (!desde || !hasta) return;

        const filtradas = todasMediciones.filter(m => {
            const ts = m.timestamp;
            return ts >= desde && ts <= hasta + 86400000;
        });

        const countEl = document.getElementById('mediciones-count');
        countEl.innerText = `Registros encontrados: ${filtradas.length}`;
    };

    navMediciones.addEventListener('click', () => switchScreen('list'));
    navReportes.addEventListener('click', () => switchScreen('reports'));

    const openForm = (id = null, s = '', d = '', p = '', ts = null) => {
        editId = id;
        sisInput.value = s;
        diaInput.value = d;
        pulInput.value = p;
        fechaInput.value = formatInputDate(ts || Date.now());
        document.getElementById('form-title').innerText = id ? 'Editar Registro' : 'Nueva Medición';
        screenList.style.display = 'none';
        screenForm.style.display = 'block';
        sisInput.focus();
    };

    window.showForm = openForm;

    const closeForm = () => {
        switchScreen('list');
        registroForm.reset();
        editId = null;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Registro';
    };

    window.hideForm = closeForm;

    addButton.addEventListener('click', () => {
        switchScreen('form');
        openForm();
    });
    cancelButton.addEventListener('click', () => closeForm());

    const setSavingState = (saving) => {
        submitBtn.disabled = saving;
        submitBtn.textContent = saving ? 'Guardando...' : 'Guardar Registro';
    };

    registroForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const sistolica = parseInt(sisInput.value, 10);
        const diastolica = parseInt(diaInput.value, 10);
        const pulsaciones = parseInt(pulInput.value, 10);
        const selectedTimestamp = fechaInput.valueAsNumber;

        if (!validateValues(sistolica, diastolica, pulsaciones)) {
            return;
        }

        const timestamp = Number.isFinite(selectedTimestamp) ? selectedTimestamp : Date.now();
        const data = {
            sistolica,
            diastolica,
            pulsaciones,
            fecha: formatDate(new Date(timestamp)),
            timestamp
        };

        try {
            setSavingState(true);

            if (editId) {
                await updateDoc(doc(db, 'mediciones', editId), data);
            } else {
                await addDoc(collection(db, 'mediciones'), data);
            }

            hideForm();
            showToast('✅ Medición guardada correctamente');
        } catch (err) {
            showToast('Error al guardar: ' + err.message, true);
        } finally {
            setSavingState(false);
        }
    });

    window.borrarRegistro = async (id) => {
        if (!confirm('¿Eliminar esta medición?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'mediciones', id));
            showToast('✅ Medición eliminada correctamente');
        } catch (err) {
            showToast('Error al eliminar: ' + err.message, true);
        }
    };

    const q = query(collection(db, 'mediciones'), orderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => {
        listaMediciones.innerHTML = '';
        emptyState.style.display = snapshot.empty ? 'block' : 'none';
        
        todasMediciones = [];

        snapshot.forEach((docSnap) => {
            const m = docSnap.data();
            const id = docSnap.id;
            todasMediciones.push(m);
            const statusColor = getStatusColor(m.sistolica, m.diastolica);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.borderLeft = `8px solid ${statusColor}`;

            const info = document.createElement('div');
            info.className = 'card-info';
            const strong = document.createElement('strong');
            strong.textContent = m.fecha || '';
            info.appendChild(strong);
            info.appendChild(document.createElement('br'));
            info.appendChild(document.createTextNode(`${m.sistolica}/${m.diastolica} mmHg | ${m.pulsaciones} pul/min`));

            const actions = document.createElement('div');
            actions.className = 'card-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-icon';
            editButton.setAttribute('aria-label', 'Editar medición');
            editButton.textContent = '✎';
            editButton.addEventListener('click', () => showForm(id, m.sistolica, m.diastolica, m.pulsaciones, m.timestamp));

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-icon btn-icon-delete';
            deleteButton.setAttribute('aria-label', 'Eliminar medición');
            deleteButton.textContent = '✕';
            deleteButton.addEventListener('click', () => borrarRegistro(id));

            actions.appendChild(editButton);
            actions.appendChild(deleteButton);
            card.appendChild(info);
            card.appendChild(actions);
            listaMediciones.appendChild(card);
        });
    });

    // Configurar filtro de descarga
    const btnDownload = document.getElementById('btn-download');
    const fechaDesdeInput = document.getElementById('fecha-desde');
    const fechaHastaInput = document.getElementById('fecha-hasta');

    // Establecer fechas por defecto (último mes)
    const hoy = new Date();
    const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    fechaDesdeInput.valueAsDate = hace30Dias;
    fechaHastaInput.valueAsDate = hoy;

    // Actualizar contador cuando cambien las fechas
    fechaDesdeInput.addEventListener('change', updateMedicionesCount);
    fechaHastaInput.addEventListener('change', updateMedicionesCount);

    btnDownload.addEventListener('click', () => {
        const desde = fechaDesdeInput.valueAsNumber;
        const hasta = fechaHastaInput.valueAsNumber;

        if (!desde || !hasta) {
            showToast('Por favor selecciona ambas fechas.', true);
            return;
        }

        if (desde > hasta) {
            showToast('La fecha de inicio debe ser anterior a la fecha de fin.', true);
            return;
        }

        const medicionesFiltradas = todasMediciones.filter(m => {
            const ts = m.timestamp;
            return ts >= desde && ts <= hasta + 86400000; // +1 día para incluir hasta el final
        });

        const fechaDesdeFormato = new Date(desde).toISOString().split('T')[0];
        const fechaHastaFormato = new Date(hasta).toISOString().split('T')[0];

        generarODT(medicionesFiltradas, fechaDesdeFormato, fechaHastaFormato);
    });
});