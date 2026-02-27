const API_BASE_URL = "https://mhs-trazabilidad.onrender.com";

let chart = null;
let empCache = [];
let deptoCache = [];
let actsDisponibles = [];
let inventarioActual = [];
let statsData = null;
let ecoData = null;
let calendar = null;
let globalViewMode = 'asignados'; 
let currentUserRole = '';
let currentUsername = '';
let currentAssetDetails = null;

let prevAlertas = 0;
let alertasInterval = null;

const defaultStats = { 
    general: { total:0, asignados:0, valor_asignados:"0.00", deptos_count:0, chart_labels:[], chart_values:[] }, 
    bodega: { total:0, valor:"0.00", nuevos:0, usados:0, chart_labels:[], chart_values:[] } 
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('es-ES', { dateStyle: 'full' });
    document.getElementById('pass').addEventListener('keypress', e => { if(e.key==='Enter') login() });
});

async function login() {
    const u = document.getElementById('user').value, p = document.getElementById('pass').value;
    if(!u || !p) { Swal.fire("Aviso", "Llene los campos para ingresar", "warning"); return; }
    try {
        const res = await fetch(`${API_BASE_URL}/login`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, password: p}) });
        if(!res.ok) { Swal.fire("Error", "Asegúrate de que FastAPI está corriendo.", "error"); return; }
        const d = await res.json();
        if(d.auth) {
            currentUserRole = d.rol;
            currentUsername = u; 
            document.getElementById('user-display-name').innerText = d.user;
            document.getElementById('user-display-role').innerText = d.rol.toUpperCase();
            
            document.getElementById('login-screen').classList.add('animate__animated','animate__fadeOutUp');
            setTimeout(() => { 
                document.getElementById('login-screen').style.display = 'none'; 
                document.getElementById('sidebar-div').style.display = 'flex'; 
                document.getElementById('main-content-div').style.display = 'block'; 
                
                if(d.rol === 'admin') {
                    document.getElementById('sidebar-admin-links').classList.remove('d-none');
                    document.getElementById('sidebar-operador-links').classList.add('d-none');
                    document.getElementById('admin-view').classList.remove('d-none');
                    document.getElementById('operador-view').classList.add('d-none');
                    document.getElementById('bell-admin').style.display = 'block';
                    document.getElementById('btn-cal-admin').style.display = 'block';
                    initAdmin();
                } else {
                    document.getElementById('sidebar-admin-links').classList.add('d-none');
                    document.getElementById('sidebar-operador-links').classList.remove('d-none');
                    document.getElementById('admin-view').classList.add('d-none');
                    document.getElementById('operador-view').classList.remove('d-none');
                    document.getElementById('bell-admin').style.display = 'none';
                    document.getElementById('btn-cal-admin').style.display = 'none';
                    vistaOperador();
                }
            }, 500);
        } else Swal.fire("Acceso Denegado", d.msg, "error");
    } catch (e) { Swal.fire("Error", "No se pudo conectar al servidor", "error"); }
}

async function initAdmin() {
    await Promise.allSettled([cargarDeptos(), cargarStats(), cargarEcoStats(), cargarListas()]);
    vistaGeneral(); 
    checkAlertas();
    if(alertasInterval) clearInterval(alertasInterval);
    alertasInterval = setInterval(checkAlertas, 15000);
}

async function checkAlertas() {
    try { 
        const r = await fetch(`${API_BASE_URL}/dashboard/alertas`); 
        const d = await r.json(); 
        const b = document.getElementById('badge-alert'); 
        if (d.alertas > 0) { 
            b.innerText = d.alertas; 
            b.style.display = 'block'; 
            if (d.alertas > prevAlertas) {
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 6000, timerProgressBar: true });
                Toast.fire({ icon: 'warning', title: `¡Atención! Tienes ${d.alertas} reporte(s) de falla pendientes.` });
            }
        } else { 
            b.style.display = 'none'; 
        } 
        prevAlertas = d.alertas; 
    } catch(e){} 
}

async function vistaOperador() {
    document.getElementById('pageTitle').innerText = "Portal de Autoservicio";
    const res = await fetch(`${API_BASE_URL}/activos/mis_equipos/${currentUsername}`);
    const equipos = await res.json();
    const cont = document.getElementById('mis-equipos-container');
    if(equipos.length === 0) {
        cont.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-emoji-frown text-muted" style="font-size: 4rem;"></i><h5 class="text-muted mt-3">No tienes equipos asignados actualmente.</h5></div>`;
        return;
    }
    cont.innerHTML = equipos.map(e => `
        <div class="col-md-4 animate__animated animate__fadeInUp">
            <div class="card-pro p-4 text-center position-relative overflow-hidden">
                <div style="background: var(--accent); height: 6px; position: absolute; top: 0; left: 0; right: 0;"></div>
                <i class="bi bi-laptop text-primary mb-2" style="font-size: 3rem;"></i>
                <h5 class="fw-bold text-dark m-0">${e.nombre_equipo}</h5>
                <p class="text-muted small mb-3">${e.marca} | S/N: ${e.serie}</p>
                <div class="badge bg-success mb-4 p-2">${e.estado_fisico}</div>
                <button onclick="reportarFallaOperador(${e.id}, '${e.nombre_equipo}')" class="btn btn-outline-danger w-100 fw-bold"><i class="bi bi-exclamation-triangle-fill me-2"></i> Reportar Falla</button>
            </div>
        </div>
    `).join('');
}

function reportarFallaOperador(id, nombre) {
    Swal.fire({
        title: `Reportar falla en ${nombre}`, input: 'textarea', inputPlaceholder: 'Describe el problema que presenta el equipo...', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Enviar Reporte a TI'
    }).then(async (result) => {
        if(result.isConfirmed && result.value) {
            await fetch(`${API_BASE_URL}/reportar_falla`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({activo_id: id, descripcion: result.value}) });
            Swal.fire('Reporte Enviado', 'El equipo de TI ha sido notificado.', 'success');
        }
    });
}

function resetNav() {
    ['nav-dash','nav-bod','nav-eco','nav-desechos', 'nav-reportes'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).classList.remove('active', 'eco-active');
    });
    document.getElementById('tableHead').innerHTML = '<tr><th>Estado</th><th>Equipo</th><th>Serie</th><th>Responsable</th><th>Ubicación</th></tr>';
    document.getElementById('stats-container').classList.remove('d-none-force');
    document.getElementById('chart-col').classList.remove('d-none-force');
    document.getElementById('table-col').classList.replace('col-lg-12', 'col-lg-8');
    const secWrap = document.getElementById('secondary-table-wrap');
    if(secWrap) secWrap.classList.add('d-none-force');
}

function vistaGeneral() {
    resetNav(); globalViewMode = 'asignados';
    document.getElementById('nav-dash').classList.add('active'); document.getElementById('pageTitle').innerText = "Panel de Operaciones";
    document.getElementById('tableTitle').innerText = "Inventario Activo";
    document.getElementById('cont-filtros-general').classList.remove('d-none-force'); document.getElementById('cont-filtros-eco').classList.add('d-none-force');
    const s = statsData ? statsData.general : defaultStats.general;
    renderCards([{l:'Total Activos', v:s.total, i:'bi-hdd-rack', c:'bg-purple'},{l:'En Operación', v:s.asignados, i:'bi-people', c:'bg-blue'},{l:'Valor en Uso', v:`$${s.valor_asignados}`, i:'bi-currency-dollar', c:'bg-green'},{l:'Áreas', v:s.deptos_count, i:'bi-building', c:'bg-orange'}]);
    renderChart(s.chart_labels, s.chart_values, 'Distribución'); cargarTabla();
}

function activarVistaBodega() {
    resetNav(); globalViewMode = 'bodega';
    document.getElementById('nav-bod').classList.add('active'); document.getElementById('pageTitle').innerText = "Gestión de Bodega";
    document.getElementById('tableTitle').innerText = "Existencias en Bodega";
    document.getElementById('cont-filtros-general').classList.remove('d-none-force'); document.getElementById('cont-filtros-eco').classList.add('d-none-force');
    const s = statsData ? statsData.bodega : defaultStats.bodega;
    renderCards([{l:'En Stock', v:s.total, i:'bi-box-seam', c:'bg-orange'},{l:'Dinero Parado', v:`$${s.valor}`, i:'bi-wallet2', c:'bg-red'},{l:'Nuevos', v:s.nuevos, i:'bi-stars', c:'bg-green'},{l:'Usados', v:s.usados, i:'bi-recycle', c:'bg-purple'}]);
    renderChart(s.chart_labels, s.chart_values, 'Estado del Stock'); cargarTabla();
}

function activarVistaEco() {
    resetNav(); globalViewMode = 'eco';
    document.getElementById('nav-eco').classList.add('eco-active'); document.getElementById('pageTitle').innerText = "Sostenibilidad & Huella CO2";
    document.getElementById('tableTitle').innerText = "Impacto Ambiental";
    document.getElementById('cont-filtros-general').classList.add('d-none-force'); document.getElementById('cont-filtros-eco').classList.remove('d-none-force');
    document.getElementById('tableHead').innerHTML = '<tr><th>Impacto</th><th>Equipo</th><th>CO2 Est. Actual</th><th>Responsable</th><th>Ubicación</th></tr>';
    const e = ecoData || {total_co2:"0", arboles:0, energia:"0", chart_labels:[], chart_values:[]};
    renderCards([{l:'CO2 Total', v:`${e.total_co2} kg`, i:'bi-cloud-haze2', c:'bg-green'},{l:'Árboles Req.', v:e.arboles, i:'bi-tree', c:'bg-green'},{l:'Energía', v:`${e.energia} kWh`, i:'bi-lightning-charge', c:'bg-green'},{l:'Auditoría', v:'OK', i:'bi-check-lg', c:'bg-green'}]);
    renderChart(e.chart_labels, e.chart_values, 'Emisiones por Área'); cargarTablaEco();
}

function activarVistaDesechos() {
    resetNav(); globalViewMode = 'desechos';
    document.getElementById('nav-desechos').classList.add('active'); document.getElementById('pageTitle').innerText = "Activos Dados de Baja (Desecho)";
    document.getElementById('tableTitle').innerText = "Registro de Desechos";
    document.getElementById('cont-filtros-general').classList.add('d-none-force'); document.getElementById('cont-filtros-eco').classList.add('d-none-force');
    document.getElementById('tableHead').innerHTML = '<tr><th>Estado</th><th>Equipo</th><th>S/N</th><th>Clasificación</th><th>Ubicación</th></tr>';
    document.getElementById('stats-container').classList.add('d-none-force'); document.getElementById('chart-col').classList.add('d-none-force'); document.getElementById('table-col').classList.replace('col-lg-8', 'col-lg-12');
    cargarTabla();
}

async function activarVistaReportes() {
    resetNav();
    globalViewMode = 'reportes';
    document.getElementById('nav-reportes').classList.add('active');
    document.getElementById('pageTitle').innerText = "Bandeja de Control de TI";
    document.getElementById('tableTitle').innerText = "Fallas Críticas Reportadas (Operadores)";
    document.getElementById('cont-filtros-general').classList.add('d-none-force');
    document.getElementById('cont-filtros-eco').classList.add('d-none-force');
    const secWrap = document.getElementById('secondary-table-wrap');
    if(secWrap) secWrap.classList.remove('d-none-force');
    document.getElementById('tableHead').innerHTML = '<tr><th>ID Reporte</th><th>Fecha</th><th>Equipo</th><th>S/N</th><th>Usuario</th><th>Descripción</th><th>Acción</th></tr>';
    document.getElementById('stats-container').classList.add('d-none-force'); document.getElementById('chart-col').classList.add('d-none-force'); document.getElementById('table-col').classList.replace('col-lg-8', 'col-lg-12');
    
    try {
        const resFallas = await fetch(`${API_BASE_URL}/reportes_fallas`);
        const fallas = await resFallas.json();
        const tFallas = document.getElementById('tBody');
        if(fallas.length === 0) {
            tFallas.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No hay reportes de fallas activos. ¡Todo funciona bien! 🎉</td></tr>`;
        } else {
            tFallas.innerHTML = fallas.map(d => `
                <tr style="background-color: #fef2f2;">
                    <td class="fw-bold text-danger" onclick="verDetalles(${d.activo_id})" style="cursor:pointer;">#${d.reporte_id}</td>
                    <td onclick="verDetalles(${d.activo_id})" style="cursor:pointer;"><span class="badge bg-dark">${d.fecha.split(' ')[0]}</span></td>
                    <td class="fw-bold" onclick="verDetalles(${d.activo_id})" style="cursor:pointer;">${d.nombre_equipo}</td>
                    <td onclick="verDetalles(${d.activo_id})" style="cursor:pointer;"><code>${d.serie}</code></td>
                    <td class="fw-bold" onclick="verDetalles(${d.activo_id})" style="cursor:pointer;">${d.reportado_por || 'Sistema'}</td>
                    <td class="text-danger" onclick="verDetalles(${d.activo_id})" style="cursor:pointer;"><i class="bi bi-exclamation-triangle-fill me-2"></i>${d.descripcion.replace('🚨 FALLA REPORTADA: ', '')}</td>
                    <td><button onclick="resolverFalla(${d.reporte_id}, '${d.nombre_equipo}')" class="btn btn-sm btn-success fw-bold shadow-sm" title="Marcar como resuelto"><i class="bi bi-check-circle-fill me-1"></i> Resolver</button></td>
                </tr>
            `).join('');
        }

        const resPrev = await fetch(`${API_BASE_URL}/activos/entregados?_=${Date.now()}`); 
        let activos = await resPrev.json();
        let preventivos = activos.filter(a => a.necesita_mant && (a.estado_activo || a.estado || '').toLowerCase() !== 'desecho');
        const tPrev = document.getElementById('tBody-preventivo');
        if(preventivos.length === 0) {
            tPrev.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">Todos los equipos tienen su mantenimiento al día. ✅</td></tr>`;
        } else {
            tPrev.innerHTML = preventivos.map(d => `
                <tr>
                    <td onclick="verDetalles(${d.id})" style="cursor:pointer;"><span class="badge bg-warning text-dark px-2 py-1"><i class="bi bi-clock-history me-1"></i> Vencido (>180 días)</span></td>
                    <td class="fw-bold text-dark" onclick="verDetalles(${d.id})" style="cursor:pointer;">${d.nombre_equipo}</td>
                    <td onclick="verDetalles(${d.id})" style="cursor:pointer;"><code>${d.serie}</code></td>
                    <td onclick="verDetalles(${d.id})" style="cursor:pointer;"><div class="fw-bold">${d.responsable}</div><small class="text-muted">${d.area}</small></td>
                    <td><button onclick="modalMant(${d.id})" class="btn btn-sm btn-outline-warning text-dark fw-bold shadow-sm"><i class="bi bi-tools me-1"></i> Registrar Preventivo</button></td>
                </tr>
            `).join('');
        }
    } catch(e) { console.log("Error al cargar reportes:", e); }
}

function filtrarMantenimiento() { activarVistaReportes(); }

function resolverFalla(reporteId, equipoNombre) {
    Swal.fire({
        title: '¿Problema Solucionado?', text: `¿Confirmas que el equipo ${equipoNombre} ha sido reparado/revisado?`, icon: 'question', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#64748b', confirmButtonText: 'Sí, está resuelto'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_BASE_URL}/resolver_falla/${reporteId}`, { method: 'POST' });
                if(res.ok) { Swal.fire('¡Excelente!', 'La falla ha sido marcada como solucionada.', 'success'); activarVistaReportes(); checkAlertas(); } 
                else { Swal.fire('Error', 'No se pudo actualizar el estado.', 'error'); }
            } catch(e) { Swal.fire("Error", "Fallo de conexión al servidor.", "error"); }
        }
    });
}

function renderCards(cards) { document.getElementById('stats-container').innerHTML = cards.map(c => `<div class="col-md-3"><div class="stat-card ${c.c}"><i class="bi ${c.i} bg-icon"></i><div class="stat-value">${c.v}</div><div class="stat-label">${c.l}</div></div></div>`).join(''); }
function renderChart(labels, values, label) { const ctx = document.getElementById('myChart').getContext('2d'); if(chart) chart.destroy(); document.getElementById('chartTitle').innerText = label; const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#14b8a6', '#f43f5e']; chart = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length), borderWidth: 2, borderColor: '#ffffff', hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels:{boxWidth:12} } }, cutout: '65%' } }); }
async function cargarStats() { try { const r = await fetch(`${API_BASE_URL}/dashboard/stats`); statsData = await r.json(); } catch(e) { statsData = defaultStats; } }
async function cargarEcoStats() { try { const r = await fetch(`${API_BASE_URL}/dashboard/eco`); ecoData = await r.json(); } catch(e) { ecoData = null; } }

async function cargarTabla() {
    if(globalViewMode === 'reportes') return; 
    const b = document.getElementById('busc').value; const res = await fetch(`${API_BASE_URL}/activos/entregados?buscar=${b}&_=${Date.now()}`); let data = await res.json();
    data.forEach(d => d.estado_real = (d.estado_activo || d.estado || d.estado_fisico || "").toLowerCase());
    if(globalViewMode === 'asignados') data = data.filter(d => !d.en_bodega && d.estado_real !== 'desecho');
    if(globalViewMode === 'bodega') data = data.filter(d => d.en_bodega && d.estado_real !== 'desecho');
    if(globalViewMode === 'desechos') data = data.filter(d => d.estado_real === 'desecho');
    if(globalViewMode !== 'desechos') {
        const f = document.getElementById('filtroEstado').value;
        if(f === 'operativo') data = data.filter(d => !d.necesita_mant && !d.es_obsoleto);
        if(f === 'mantenimiento') data = data.filter(d => d.necesita_mant);
        if(f === 'obsoleto') data = data.filter(d => d.es_obsoleto);
    }
    inventarioActual = data; const t = document.getElementById('tBody');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted">No se encontraron registros</td></tr>`; return; }
    t.innerHTML = data.map(d => {
        if(globalViewMode === 'desechos') { return `<tr onclick="verDetalles(${d.id})" style="cursor:pointer"><td><span class="badge bg-dark">De Baja</span></td><td><div class="fw-bold text-dark">${d.nombre_equipo}</div><div class="small text-muted">${d.marca}</div></td><td><code>${d.serie}</code></td><td class="text-danger fw-bold">Desechado</td><td>-</td></tr>`; }
        let badge = d.es_obsoleto ? '<span class="badge-soft-danger">Obsoleto</span>' : (d.necesita_mant ? '<span class="badge-soft-warning">Mantenimiento</span>' : '<span class="badge-soft-success">Operativo</span>');
        return `<tr onclick="verDetalles(${d.id})" style="cursor:pointer"><td>${badge}</td><td><div class="fw-bold text-dark">${d.nombre_equipo}</div><div class="small text-muted">${d.marca}</div></td><td><code>${d.serie}</code></td><td><div class="fw-bold">${d.responsable}</div></td><td>${d.area}</td></tr>`;
    }).join('');
}

async function cargarTablaEco() {
    const res = await fetch(`${API_BASE_URL}/activos/entregados?_=${Date.now()}`); let data = await res.json();
    data = data.filter(d => { const s = (d.estado_activo || d.estado || d.estado_fisico || "").toLowerCase(); return s !== 'desecho' && s !== 'baja'; });
    data.forEach(d => { d.co2_sort = (d.precio_compra*0.45) + (((new Date() - new Date(d.fecha_ingreso))/(1000*60*60*24*365)) * 15.5); });
    const avg = data.reduce((s,x)=>s+x.co2_sort,0)/data.length || 1;
    const fGasto = document.getElementById('filtroEcoGasto').value, fDepto = document.getElementById('filtroEcoDepto').value;
    if(fDepto !== 'todos') data = data.filter(d => d.area === fDepto);
    if(fGasto === 'alto') data = data.filter(d=>d.co2_sort > avg); if(fGasto === 'bajo') data = data.filter(d=>d.co2_sort <= avg);
    data.sort((a,b)=>b.co2_sort - a.co2_sort);
    document.getElementById('tBody').innerHTML = data.map(d => `<tr onclick="verDetalles(${d.id})" style="cursor:pointer"><td>${d.co2_sort>avg ? '<span class="badge-soft-danger">ALTO</span>':'<span class="badge-soft-success">BAJO</span>'}</td><td><b>${d.nombre_equipo}</b></td><td class="fw-bold text-success">${d.co2_sort.toFixed(1)} kg</td><td>${d.responsable}</td><td>${d.area}</td></tr>`).join('');
}

function filtrarHistorial() {
    const f = document.getElementById('filtro-historial').value; let hist = currentAssetDetails.historial || [];
    if (f === 'mantenimiento') { hist = hist.filter(h => h.accion.toLowerCase().includes('mantenimiento') || h.accion.toLowerCase().includes('reporte') || h.accion.toLowerCase().includes('resolución')); } 
    else if (f === 'operacion') { hist = hist.filter(h => h.accion.toLowerCase().includes('asignación') || h.accion.toLowerCase().includes('devolución') || h.accion.toLowerCase().includes('ingreso') || h.accion.toLowerCase().includes('baja')); }
    const cont = document.getElementById('historial-container');
    if (hist.length > 0) { 
        cont.innerHTML = hist.map(h => {
            let textColor = h.accion.includes('Reporte') ? 'text-danger fw-bold' : (h.accion.includes('Resolución') ? 'text-success fw-bold' : '');
            return `<div class="d-flex justify-content-between mb-1 border-bottom pb-1"><span class="${textColor}"><b>${h.accion}:</b> ${h.detalle}</span><span class="text-muted small">${h.fecha}</span></div>`;
        }).join(''); 
    } else { cont.innerHTML = '<div class="text-center text-muted fst-italic">Sin registros para este filtro</div>'; }
}

function descargarPlantilla() {
    const wb = XLSX.utils.book_new();
    const ws_data = [ ["Nombre", "Marca", "Modelo", "Serie", "Precio", "Estado"], ["Laptop ThinkPad", "Lenovo", "T14", "SN-12345", 1200.50, "Nuevo"], ["Monitor UltraSharp", "Dell", "U2422H", "SN-98765", 250.00, "Usado"] ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Activos");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const url = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla_Importacion_MHS.xlsx'; a.click();
}

async function exportarExcel() { 
    const ws = XLSX.utils.json_to_sheet(inventarioActual); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Inventario"); 
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const url = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
    const a = document.createElement('a'); a.href = url; a.download = 'Reporte_Activos.xlsx'; a.click();
}

async function subirExcel() {
    const fileInput = document.getElementById('fileExcel'); const file = fileInput.files[0];
    if (!file) { return Swal.fire("Atención", "Por favor, selecciona un archivo Excel primero.", "warning"); }
    const formData = new FormData(); formData.append("file", file);
    try {
        Swal.fire({ title: 'Procesando archivo...', text: 'Por favor espera mientras importamos los equipos a la base de datos.', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        const res = await fetch(`${API_BASE_URL}/activos/importar`, { method: 'POST', body: formData }); 
        const data = await res.json();
        
        // EL CAMBIO ESTÁ AQUÍ: Le quitamos la exigencia de la palabra 'ok' y solo verificamos que el servidor haya respondido bien (res.ok)
        if (res.ok) { 
            bootstrap.Modal.getInstance(document.getElementById('modalImportar')).hide(); 
            fileInput.value = ''; 
            Swal.fire("¡Importación Exitosa!", data.msg || data.message || "Los equipos se subieron correctamente.", "success").then(() => initAdmin()); 
        } else { 
            Swal.fire("Error en la Carga", data.detail || data.msg || "Hubo un problema al subir los equipos.", "error"); 
        }
    } catch (e) { 
        Swal.fire("Error", "No se pudo conectar al servidor para la importación.", "error"); 
    }
}

function generarPDFTrazabilidad() {
    if(!currentAssetDetails) return; const d = currentAssetDetails; const { jsPDF } = window.jspdf; const doc = new jsPDF(); 
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("MHS ENTERPRISE", 20, 20); doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text("REPORTE DE TRAZABILIDAD DE ACTIVO", 20, 32); doc.setTextColor(0,0,0); 
    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); 
    doc.setFontSize(10); doc.text(`San Pedro Sula, ${fecha}`, 190, 50, { align: "right" }); doc.setFont("helvetica", "bold"); doc.text("INFORMACIÓN GENERAL DEL EQUIPO:", 20, 65); doc.setFont("helvetica", "normal");
    const respStr = d.equipo.resp_actual ? d.equipo.resp_actual : 'Ninguno (En Bodega / Desecho)';
    doc.text(`Equipo: ${d.equipo.nombre_equipo}`, 20, 75); doc.text(`Marca y Modelo: ${d.equipo.marca} ${d.equipo.modelo ? '/ '+d.equipo.modelo : ''}`, 20, 82); doc.text(`Número de Serie: ${d.equipo.serie}`, 20, 89); doc.text(`Estado Operativo: ${d.equipo.estado} (${d.equipo.estado_fisico})`, 20, 96); doc.setFont("helvetica", "bold"); doc.text(`Propietario / Asignación Actual: ${respStr}`, 20, 106);
    const f = document.getElementById('filtro-historial') ? document.getElementById('filtro-historial').value : 'todos'; let hist = d.historial || [];
    if (f === 'mantenimiento') hist = hist.filter(h => h.accion.toLowerCase().includes('mantenimiento') || h.accion.toLowerCase().includes('reporte') || h.accion.toLowerCase().includes('resolución'));
    if (f === 'operacion') hist = hist.filter(h => h.accion.toLowerCase().includes('asignación') || h.accion.toLowerCase().includes('devolución') || h.accion.toLowerCase().includes('ingreso') || h.accion.toLowerCase().includes('baja'));
    const tableBody = hist.map(h => [h.fecha, h.accion, h.detalle]);
    doc.autoTable({ startY: 115, head: [['FECHA', 'TIPO DE ACCIÓN', 'DETALLES']], body: tableBody, theme: 'grid', headStyles: {fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center'}, bodyStyles: {valign: 'middle'}, columnStyles: { 0: {cellWidth: 35}, 1: {cellWidth: 40} } }); 
    const finalY = doc.lastAutoTable.finalY + 15; doc.setFontSize(8); doc.text("Este documento es generado automáticamente por la Plataforma de Gestión de Activos de MHS Enterprise.", 105, finalY, {align: "center"}); doc.save(`Trazabilidad_${d.equipo.serie}.pdf`);
}

// -------------------------------------------------------------
// VISTA DETALLES (AHORA INCLUYE LA PESTAÑA DE IA PREDICTIVA)
// -------------------------------------------------------------
async function verDetalles(id) {
    const res = await fetch(`${API_BASE_URL}/activos/${id}/detalles`), d = await res.json();
    currentAssetDetails = d; 
    const isDesecho = (d.equipo.estado || "").toLowerCase() === 'desecho';
    
    let controlesAdmin = '';
    if(currentUserRole === 'admin') {
        let btnBaja = !isDesecho ? `<button onclick="darDeBaja(${id}, '${d.equipo.nombre_equipo}', '${d.equipo.serie}')" class="btn btn-dark w-100 fw-bold mt-2"><i class="bi bi-trash3 me-2"></i>Dar de Baja (Desecho)</button>` : `<div class="alert alert-dark text-center mt-2 mb-0 p-2 fw-bold">EQUIPO DADO DE BAJA</div>`;
        let btnDev = (d.equipo.asignado_a && !isDesecho) ? `<button onclick="abrirModalDev(${id}, '${d.equipo.nombre_equipo}', '${d.equipo.resp_actual}')" class="btn btn-outline-danger w-100 fw-bold"><i class="bi bi-arrow-return-left me-2"></i>Retornar a Bodega</button>` : '';
        controlesAdmin = btnDev + btnBaja;
    }

    const duenosHTML = d.duenos_anteriores.length > 0 ? d.duenos_anteriores.map(x => `<span class="badge bg-secondary me-1 mb-1">${x}</span>`).join('') : '<span class="text-muted small">Ninguno (Único o Nuevo)</span>';

    Swal.fire({
        title: `<div class="d-flex justify-content-between align-items-center w-100"><div class="d-flex align-items-center gap-2"><i class="bi bi-pc-display-horizontal text-primary"></i> <span class="fw-bold text-dark fs-5">${d.equipo.nombre_equipo}</span></div></div>`,
        html: `
        <ul class="nav nav-tabs mb-3" style="font-size: 0.85rem; font-weight: 500;">
            <li class="nav-item"><a class="nav-link active" style="cursor:pointer" onclick="swTab('ficha')">Ficha</a></li>
            <li class="nav-item"><a class="nav-link text-primary fw-bold" style="cursor:pointer" onclick="swTab('ia')"><i class="bi bi-robot"></i> IA</a></li>
            <li class="nav-item"><a class="nav-link" style="cursor:pointer" onclick="swTab('eco')">CO2</a></li>
            <li class="nav-item"><a class="nav-link" style="cursor:pointer" onclick="swTab('qr')"><i class="bi bi-qr-code"></i></a></li>
        </ul>
        
        <div id="tab-ficha" class="text-start"><div class="row g-2 mb-3"><div class="col-6"><div class="p-2 border rounded bg-light"><small class="text-muted d-block" style="font-size:0.7rem">ADQUISICIÓN / COMPRA</small><span class="fw-bold text-dark">${d.fecha_adquisicion} | $${d.equipo.precio_compra}</span></div></div><div class="col-6"><div class="p-2 border rounded bg-light"><small class="text-muted d-block" style="font-size:0.7rem">VALOR LIBROS (ACTUAL)</small><span class="fw-bold text-primary">${d.finanzas.valor_actual}</span></div></div></div><small class="fw-bold text-uppercase text-muted d-block mb-1">Dueños Anteriores</small><div class="mb-3">${duenosHTML}</div><h6 class="fw-bold small text-muted text-uppercase mb-2"><i class="bi bi-graph-down me-1"></i> Depreciación Financiera</h6><div class="border rounded p-2 mb-3 position-relative" style="height: 150px; width: 100%;"><canvas id="chartDev"></canvas></div><div class="d-flex justify-content-between align-items-center mb-2 border-top pt-3"><small class="fw-bold text-uppercase text-muted">Mantenimientos y Reportes</small>${(!isDesecho && currentUserRole === 'admin') ? `<button onclick="modalMant(${id})" class="btn btn-sm btn-light border py-0 px-2">+ Evento</button>` : ''}</div><div class="bg-light rounded border p-2 mb-3" style="max-height:80px; overflow-y:auto; font-size:0.8rem;">${d.mantenimientos && d.mantenimientos.length > 0 ? d.mantenimientos.map(m => { let textColor = m.descripcion.includes('FALLA REPORTADA') ? 'text-danger fw-bold' : (m.descripcion.includes('FALLA RESUELTA') ? 'text-success fw-bold' : ''); return `<div class="d-flex justify-content-between mb-1 border-bottom pb-1"><span class="${textColor}">${m.descripcion}</span><span class="fw-bold">$${m.costo}</span></div>`}).join('') : '<div class="text-center text-muted fst-italic">Sin mantenimientos ni fallas</div>'}</div><div class="d-flex justify-content-between align-items-center mb-2 border-top pt-3"><small class="fw-bold text-uppercase text-muted">Trazabilidad</small><div class="d-flex gap-1"><select id="filtro-historial" onchange="filtrarHistorial()" class="form-select form-select-sm" style="font-size: 0.7rem; padding: 2px 20px 2px 8px; min-height: auto;"><option value="todos">Todos</option><option value="mantenimiento">Mantenimiento/Fallas</option><option value="operacion">Operación</option></select><button onclick="generarPDFTrazabilidad()" class="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center" style="padding: 2px 6px;" title="Exportar a PDF"><i class="bi bi-file-earmark-pdf"></i></button></div></div><div id="historial-container" class="bg-light rounded border p-2 mb-2" style="max-height:100px; overflow-y:auto; font-size:0.8rem;">${d.historial && d.historial.length > 0 ? d.historial.map(h => { let textColor = h.accion.includes('Reporte') ? 'text-danger fw-bold' : (h.accion.includes('Resolución') ? 'text-success fw-bold' : ''); return `<div class="d-flex justify-content-between mb-1 border-bottom pb-1"><span class="${textColor}"><b>${h.accion}:</b> ${h.detalle}</span><span class="text-muted small">${h.fecha}</span></div>`}).join('') : '<div class="text-center text-muted fst-italic">Sin registros</div>'}</div>${controlesAdmin}</div>
        
        <div id="tab-ia" class="text-start d-none py-2">
            <div class="text-center mb-4 mt-2">
                <i class="bi bi-robot text-${d.prediccion_ia.color} mb-2" style="font-size: 3rem;"></i>
                <h6 class="fw-bold text-dark fs-5">Análisis Predictivo de Riesgo</h6>
                <p class="text-muted small">Algoritmo heurístico que evalúa antigüedad del equipo, condición física actual y frecuencia de reparaciones.</p>
            </div>
            
            <div class="mb-4 bg-light p-3 rounded border">
                <div class="d-flex justify-content-between mb-1">
                    <span class="fw-bold text-muted text-uppercase" style="font-size:0.8rem;">Probabilidad de Falla Crítica:</span>
                    <span class="fw-bold text-${d.prediccion_ia.color} fs-6">${d.prediccion_ia.riesgo_pct}%</span>
                </div>
                <div class="progress" style="height: 12px; border-radius: 10px;">
                    <div class="progress-bar bg-${d.prediccion_ia.color} progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${d.prediccion_ia.riesgo_pct}%"></div>
                </div>
            </div>
            
            <div class="alert alert-${d.prediccion_ia.color} border-0 shadow-sm d-flex gap-3 align-items-center">
                <i class="bi ${d.prediccion_ia.color === 'success' ? 'bi-shield-check' : (d.prediccion_ia.color === 'warning' ? 'bi-exclamation-triangle' : 'bi-x-octagon')} fs-1"></i>
                <div>
                    <h6 class="alert-heading fw-bold mb-1">Diagnóstico: ${d.prediccion_ia.estado}</h6>
                    <p class="mb-0 small" style="line-height:1.2;">${d.prediccion_ia.sugerencia}</p>
                </div>
            </div>
        </div>

        <div id="tab-eco" class="text-start d-none"><h6 class="fw-bold small text-muted text-uppercase mb-2"><i class="bi bi-leaf me-1 text-success"></i> Desglose de Huella (kg CO2)</h6><div class="row g-2 mb-4"><div class="col-6"><div class="p-2 rounded text-center border" style="background:#f0fdf4; border-color:#bbf7d0!important;"><small class="d-block text-muted" style="font-size:0.6rem">FABRICACIÓN</small><b class="text-success">${d.eco.fabricacion} kg</b></div></div><div class="col-6"><div class="p-2 rounded text-center border" style="background:#fff7ed; border-color:#fed7aa!important;"><small class="d-block text-muted" style="font-size:0.6rem">USO ANUAL (Con mant.)</small><b class="text-warning">${d.eco.uso_anual} kg</b></div></div><div class="col-6"><div class="p-2 rounded text-center border" style="background:#f8fafc; border-color:#cbd5e1!important;"><small class="d-block text-muted" style="font-size:0.6rem">ACUMULADO ACTUAL</small><b class="text-dark">${d.eco.actual} kg</b></div></div><div class="col-6"><div class="p-2 rounded text-center border" style="background:#eff6ff; border-color:#bfdbfe!important;"><small class="d-block text-muted" style="font-size:0.6rem">DESECHO FINAL</small><b class="text-primary">${d.eco.desecho} kg</b></div></div></div><h6 class="fw-bold small text-muted text-uppercase mb-2"><i class="bi bi-cloud-haze2 me-1"></i> Proyección a 5 Años</h6><div class="border rounded p-2 mb-3 position-relative" style="height: 150px; width: 100%;"><canvas id="chartEco"></canvas></div><div class="d-flex justify-content-between align-items-center border-top pt-2"><span class="small text-muted" style="font-size:0.65rem;">* Los mantenimientos reducen el impacto anual.</span><span class="fw-bold text-success">Total a 5 años: ${d.eco.total_proyectado} kg</span></div></div>
        <div id="tab-qr" class="text-center d-none py-4"><img src="${API_BASE_URL}/activos/${id}/qr" class="img-thumbnail shadow-sm mb-3" style="width: 200px; height: 200px;"><p class="text-muted small fw-bold">Escanea este código para auditoría rápida.</p></div>
        `, 
        showConfirmButton: false, showCloseButton: true, width: '550px',
        didOpen: () => { 
            // Modificado para soportar la pestaña IA
            window.swTab = function(tabName) { ['ficha', 'ia', 'eco', 'qr'].forEach(t => document.getElementById(`tab-${t}`).classList.add('d-none')); document.getElementById(`tab-${tabName}`).classList.remove('d-none'); document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active')); event.target.classList.add('active'); };
            const ctxDev = document.getElementById('chartDev').getContext('2d'); const gradDev = ctxDev.createLinearGradient(0, 0, 0, 150); gradDev.addColorStop(0, 'rgba(37, 99, 235, 0.2)'); gradDev.addColorStop(1, 'rgba(37, 99, 235, 0.0)'); new Chart(ctxDev, { type: 'line', data: { labels: d.finanzas.chart_labels, datasets: [{ label: 'Valor Libros ($)', data: d.finanzas.chart_data, borderColor: '#2563eb', backgroundColor: gradDev, borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [2, 4], color: '#e2e8f0' }, ticks: { font: {size: 10} } }, x: { grid: { display: false }, ticks: { font: {size: 10} } } }, layout: { padding: 5 } } }); 
            const ctxEco = document.getElementById('chartEco').getContext('2d'); const gradEco = ctxEco.createLinearGradient(0, 0, 0, 150); gradEco.addColorStop(0, 'rgba(16, 185, 129, 0.2)'); gradEco.addColorStop(1, 'rgba(16, 185, 129, 0.0)'); new Chart(ctxEco, { type: 'line', data: { labels: d.eco.co2_labels, datasets: [{ label: 'CO2 (kg)', data: d.eco.co2_data, borderColor: '#10b981', backgroundColor: gradEco, borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { borderDash: [2, 4], color: '#e2e8f0' }, ticks: { font: {size: 10} } }, x: { grid: { display: false }, ticks: { font: {size: 10} } } }, layout: { padding: 5 } } }); 
        }
    });
}

function abrirModalDev(id, nombreEquipo, nombreEmpleado) { Swal.close(); document.getElementById('dev-id').value = id; document.getElementById('dev-nom').value = nombreEquipo; document.getElementById('dev-emp').value = nombreEmpleado || 'Sin asignar'; new bootstrap.Modal(document.getElementById('modalDev')).show(); }
async function procesarDevolucion() { const id = document.getElementById('dev-id').value, equipo = document.getElementById('dev-nom').value, emp = document.getElementById('dev-emp').value, razon = document.getElementById('dev-razon').value, estado = document.getElementById('dev-estado').value; if(!razon) return Swal.fire("Atención", "Debe indicar el motivo", "warning"); const res = await fetch(`${API_BASE_URL}/devolucion`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({activo_id: parseInt(id), estado_fisico: estado}) }); if(res.ok) { generarActaDevolucionPDF(equipo, emp, razon, estado); bootstrap.Modal.getInstance(document.getElementById('modalDev')).hide(); document.getElementById('dev-razon').value = ''; Swal.fire("Procesado", "Equipo retornado.", "success").then(() => initAdmin()); } else { Swal.fire("Error", "No se pudo procesar", "error"); } }
function darDeBaja(id, nombreEquipo, serie) { Swal.fire({ title: 'Dar de Baja (Desecho)', text: 'Motivo (Ej. Daño irreparable, Obsolescencia):', input: 'text', icon: 'warning', showCancelButton: true, confirmButtonColor: '#1e293b', confirmButtonText: 'Confirmar Baja' }).then(async (result) => { if(result.isConfirmed && result.value) { await fetch(`${API_BASE_URL}/activos/desecho`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({activo_id: id, motivo: result.value}) }); generarActaBajaPDF(nombreEquipo, serie, result.value); Swal.fire('Baja Exitosa', 'El equipo ha sido marcado como desecho.', 'success').then(()=>initAdmin()); } }); }
function modalMant(id) { Swal.close(); Swal.fire({ title: 'Mantenimiento', html: `<input id="md" class="form-control mb-2" placeholder="Detalle (Ej. Limpieza o Reparación)"><input id="mf" type="date" class="form-control mb-2" value="${new Date().toISOString().split('T')[0]}"><input id="mc" type="number" class="form-control" placeholder="Costo ($)">`, preConfirm: () => ({ activo_id: id, descripcion: document.getElementById('md').value, fecha: document.getElementById('mf').value, costo: parseFloat(document.getElementById('mc').value || 0) }) }).then(async r => { if(r.isConfirmed) { await fetch(`${API_BASE_URL}/mantenimientos/`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(r.value) }); verDetalles(id); if (globalViewMode === 'reportes') activarVistaReportes(); else cargarTabla(); }}); }
async function asignar(e) { e.preventDefault(); await fetch(`${API_BASE_URL}/asignar`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ activo_id: parseInt(document.getElementById('sa').value), empleado_id: parseInt(document.getElementById('se').value), area_id: parseInt(document.getElementById('sd').value) }) }); const eq = actsDisponibles.find(a => a.id == document.getElementById('sa').value), emp = empCache.find(em => em.id == document.getElementById('se').value); generarActaPDF(eq, emp); bootstrap.Modal.getInstance(document.getElementById('modalAsignar')).hide(); e.target.reset(); Swal.fire("Asignado", "Acta generada.", "success").then(() => initAdmin()); }
async function postStock() { const b = { nombre_equipo: document.getElementById('sn').value, marca: document.getElementById('sm').value, modelo: document.getElementById('smo').value, serie: document.getElementById('ss').value, precio_compra: parseFloat(document.getElementById('sp').value), estado_fisico: document.getElementById('sef').value }; await fetch(`${API_BASE_URL}/activos/stock`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b) }); bootstrap.Modal.getInstance(document.getElementById('modalStock')).hide(); ['sn','sm','smo','ss','sp'].forEach(i=>document.getElementById(i).value=''); initAdmin(); }
async function postEmp() { await fetch(`${API_BASE_URL}/empleados/`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({nombre: document.getElementById('en').value, departamento_id: parseInt(document.getElementById('ed').value)}) }); bootstrap.Modal.getInstance(document.getElementById('modalEmp')).hide(); document.getElementById('en').value = ''; initAdmin(); }

async function cargarUsuarios() { const res = await fetch(`${API_BASE_URL}/usuarios`); const users = await res.json(); const lista = document.getElementById('listaUsuarios'); lista.innerHTML = users.map(u => `<li class="list-group-item d-flex justify-content-between align-items-center"><div><strong>${u.username}</strong> <span class="text-muted small">(${u.rol})</span></div>${u.username !== 'admin' ? `<button onclick="borrarUsuario(${u.id})" class="btn btn-sm btn-outline-danger py-0">x</button>` : ''}</li>`).join(''); }
async function postUsuario() { const u = document.getElementById('nu').value, p = document.getElementById('np').value, n = document.getElementById('nn').value, r = document.getElementById('nr').value, depto = document.getElementById('nu-depto').value; if(!u || !p || !n || !depto) { return Swal.fire("Atención", "Llene todos los campos", "warning"); } try { const bodyData = {username: u, password: p, nombre_completo: n, rol: r, departamento_id: parseInt(depto)}; const res = await fetch(`${API_BASE_URL}/usuarios`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(bodyData) }); const data = await res.json(); if(res.ok && data.status === 'ok') { ['nu', 'np', 'nn', 'nu-depto'].forEach(id => document.getElementById(id).value = ''); cargarUsuarios(); cargarListas(); Swal.fire("Éxito", "Usuario y Empleado creados.", "success"); } else { Swal.fire("Error", data.msg || "El usuario ya existe", "error"); } } catch(e) { Swal.fire("Error", "Error de red al crear usuario", "error"); } }
async function borrarUsuario(id) { if(confirm("¿Eliminar usuario?")) { await fetch(`${API_BASE_URL}/usuarios/${id}`, { method: 'DELETE' }); cargarUsuarios(); } }
async function cargarListas() { const [rA, rE] = await Promise.all([fetch(`${API_BASE_URL}/activos/disponibles`), fetch(`${API_BASE_URL}/empleados/`)]); actsDisponibles = await rA.json(); empCache = await rE.json(); document.getElementById('sa').innerHTML = '<option value="">Seleccione equipo...</option>' + actsDisponibles.map(a => `<option value="${a.id}">${a.nombre_equipo} [${a.serie}]</option>`).join(''); document.getElementById('se').innerHTML = '<option value="" selected>Seleccione colaborador/usuario...</option>' + empCache.map(e => `<option value="${e.id}">${e.nombre}</option>`).join(''); }
async function cargarDeptos() { const r = await fetch(`${API_BASE_URL}/data/departamentos`); deptoCache = await r.json(); const optsIds = deptoCache.map(x => `<option value="${x.id}">${x.nombre}</option>`).join(''); const optsNombres = deptoCache.map(x => `<option value="${x.nombre}">${x.nombre}</option>`).join(''); document.getElementById('ed').innerHTML = `<option value="" disabled selected>Seleccione...</option>` + optsIds; document.getElementById('sd').innerHTML = `<option value="" disabled selected>Autocompletado...</option>` + optsIds; document.getElementById('nu-depto').innerHTML = `<option value="" disabled selected>Departamento...</option>` + optsIds; document.getElementById('filtroEcoDepto').innerHTML = '<option value="todos">Todos los Deptos</option>' + optsNombres; }
function autoArea() { const e = empCache.find(x => x.id == document.getElementById('se').value); if(e) document.getElementById('sd').value = e.departamento_id; }

function generarActaPDF(eq, emp) { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("MHS ENTERPRISE", 20, 20); doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text("ACTA DE RESPONSABILIDAD", 20, 32); doc.setTextColor(0,0,0); doc.setFontSize(10); const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); doc.text(`San Pedro Sula, ${fecha}`, 190, 50, { align: "right" }); doc.text("Se hace constar la entrega formal del siguiente activo fijo:", 20, 65); doc.setFont("helvetica", "bold"); doc.text(`NOMBRE: ${emp.nombre.toUpperCase()}`, 20, 80); doc.autoTable({ startY: 90, head: [['CÓDIGO/SERIE', 'EQUIPO', 'MARCA', 'ESTADO']], body: [[eq.serie, eq.nombre_equipo, eq.marca, 'BUENO / OPERATIVO']], theme: 'grid', headStyles: {fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center'}, bodyStyles: {halign: 'center'} }); let y = doc.lastAutoTable.finalY + 15; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("CONDICIONES DE USO Y RESPONSABILIDAD:", 20, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(9); const terminos = ["1. CUSTODIA: El colaborador asume la responsabilidad total de su cuidado.", "2. USO EXCLUSIVO: El activo es herramienta exclusiva de trabajo.", "3. REPORTE DE FALLAS: Cualquier desperfecto debe ser reportado a TI.", "4. DEVOLUCIÓN: Al finalizar la relación laboral, el equipo debe ser devuelto."]; terminos.forEach(t => { doc.text(t, 20, y); y += 6; }); const yFirmas = 240; doc.setDrawColor(0); doc.setLineWidth(0.1); doc.line(30, yFirmas, 90, yFirmas); doc.setFont("helvetica", "bold"); doc.text("RECIBÍ CONFORME", 60, yFirmas + 5, {align: 'center'}); doc.setFont("helvetica", "normal"); doc.text(emp.nombre, 60, yFirmas + 10, {align: 'center'}); doc.line(120, yFirmas, 180, yFirmas); doc.setFont("helvetica", "bold"); doc.text("AUTORIZADO POR", 150, yFirmas + 5, {align: 'center'}); doc.setFont("helvetica", "normal"); doc.text("DEPARTAMENTO DE TI", 150, yFirmas + 10, {align: 'center'}); doc.save(`Acta_Entrega_${eq.serie}.pdf`); }
function generarActaDevolucionPDF(equipo, empleado, motivo, estado) { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("MHS ENTERPRISE", 20, 20); doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text("CONSTANCIA DE RECEPCIÓN DE ACTIVOS", 20, 32); doc.setTextColor(0,0,0); doc.setFontSize(10); const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); doc.text(`San Pedro Sula, ${fecha}`, 190, 50, { align: "right" }); doc.text("Por medio de la presente, se certifica la devolución formal del siguiente activo:", 20, 65); doc.setFont("helvetica", "bold"); doc.text(`COLABORADOR: ${empleado.toUpperCase()}`, 20, 75); doc.autoTable({ startY: 85, head: [['EQUIPO', 'ESTADO DE ENTREGA', 'MOTIVO']], body: [[equipo, estado.toUpperCase(), motivo]], theme: 'grid', headStyles: {fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center'}, bodyStyles: {halign: 'center'} }); doc.setFont("helvetica", "normal"); const texto = "El Departamento de TI valida que el equipo ha sido recibido conforme a las políticas de la empresa."; doc.text(doc.splitTextToSize(texto, 170), 20, doc.lastAutoTable.finalY + 15); const yFirmas = 240; doc.setDrawColor(0); doc.setLineWidth(0.1); doc.line(30, yFirmas, 90, yFirmas); doc.line(120, yFirmas, 180, yFirmas); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("ENTREGADO POR", 60, yFirmas + 5, {align: 'center'}); doc.text(empleado, 60, yFirmas + 10, {align: 'center'}); doc.text("RECIBIDO POR", 150, yFirmas + 5, {align: 'center'}); doc.text("DEPARTAMENTO DE TI", 150, yFirmas + 10, {align: 'center'}); doc.save(`Devolucion_${equipo}.pdf`); }
function generarActaBajaPDF(equipo, serie, motivo) { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFillColor(185, 28, 28); doc.rect(0, 0, 210, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("MHS ENTERPRISE", 20, 20); doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text("ACTA DE BAJA DE ACTIVO (DESECHO)", 20, 32); doc.setTextColor(0,0,0); doc.setFontSize(10); const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); doc.text(`San Pedro Sula, ${fecha}`, 190, 50, { align: "right" }); doc.text("Por medio de la presente, se certifica la baja definitiva del siguiente activo:", 20, 65); doc.autoTable({ startY: 75, head: [['EQUIPO', 'SERIE', 'MOTIVO DE BAJA']], body: [[equipo, serie, motivo]], theme: 'grid', headStyles: {fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold', halign: 'center'}, bodyStyles: {halign: 'center'} }); doc.setFont("helvetica", "normal"); const texto = "El activo mencionado ha sido evaluado y se ha determinado que no es apto para continuar operando en la empresa, procediendo con su disposición final conforme a las políticas ambientales y financieras."; doc.text(doc.splitTextToSize(texto, 170), 20, doc.lastAutoTable.finalY + 15); const yFirmas = 240; doc.setDrawColor(0); doc.setLineWidth(0.1); doc.line(30, yFirmas, 90, yFirmas); doc.line(120, yFirmas, 180, yFirmas); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("AUTORIZADO POR (GERENCIA)", 60, yFirmas + 5, {align: 'center'}); doc.text("MHS Enterprise", 60, yFirmas + 10, {align: 'center'}); doc.text("EJECUTADO POR (TI)", 150, yFirmas + 5, {align: 'center'}); doc.text("DEPARTAMENTO DE TI", 150, yFirmas + 10, {align: 'center'}); doc.save(`Acta_Baja_${serie}.pdf`); }
async function verCalendario() { new bootstrap.Modal(document.getElementById('modalCal')).show(); setTimeout(async () => { const res = await fetch(`${API_BASE_URL}/mantenimientos/calendario`), events = await res.json(); if (!calendar) calendar = new FullCalendar.Calendar(document.getElementById('calendar'), { initialView: 'dayGridMonth', locale: 'es', events: events, themeSystem: 'bootstrap5' }); else { calendar.removeAllEvents(); calendar.addEventSource(events); } calendar.render(); }, 300); }