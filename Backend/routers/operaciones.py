from fastapi import APIRouter, UploadFile, File
from psycopg2.extras import RealDictCursor
from database import get_db, registrar_evento
from models import ActivoStock, Asignacion, DevolucionRequest, DesechoRequest, EmpleadoCreate, MantenimientoCreate, ReporteFalla
import openpyxl
from io import BytesIO

router = APIRouter()

@router.post("/reportar_falla")
def reportar_falla(r: ReporteFalla):
    conn = get_db(); cur = conn.cursor()
    desc = f"🚨 FALLA REPORTADA: {r.descripcion}"
    cur.execute("INSERT INTO mantenimientos (activo_id, descripcion, fecha, costo) VALUES (%s, %s, CURRENT_DATE, 0)", 
                (r.activo_id, desc))
    conn.commit(); conn.close()
    registrar_evento(r.activo_id, "Reporte Usuario", desc)
    return {"status": "ok"}

@router.post("/activos/stock")
def crear_stock(act: ActivoStock):
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT INTO activos (nombre_equipo, marca, modelo, serie, precio_compra, estado_fisico, fecha_ingreso, estado) VALUES (%s,%s,%s,%s,%s,%s, CURRENT_DATE, 'Disponible') RETURNING id", (act.nombre_equipo, act.marca, act.modelo, act.serie, act.precio_compra, act.estado_fisico))
    nid = cur.fetchone()[0]; conn.commit(); conn.close(); registrar_evento(nid, "Ingreso", "Alta en sistema"); return {"status": "ok"}

@router.post("/asignar")
def asignar(datos: Asignacion):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT nombre FROM empleados WHERE id = %s", (datos.empleado_id,)); emp = cur.fetchone()
    e_nom = emp['nombre'] if emp else str(datos.empleado_id)
    cur.execute("UPDATE activos SET asignado_a = %s, area_id = %s, estado = 'Entregado' WHERE id = %s", (datos.empleado_id, datos.area_id, datos.activo_id))
    conn.commit(); conn.close(); registrar_evento(datos.activo_id, "Asignación", f"Asignado a: {e_nom}"); return {"status": "ok"}

@router.post("/devolucion")
def devolver_activo(datos: DevolucionRequest):
    conn = get_db(); cur = conn.cursor(); cur.execute("UPDATE activos SET asignado_a = NULL, area_id = NULL, estado = 'Disponible', estado_fisico = %s WHERE id = %s", (datos.estado_fisico, datos.activo_id)); conn.commit(); conn.close(); registrar_evento(datos.activo_id, "Devolución", f"Retornado: {datos.estado_fisico}"); return {"status": "ok"}

@router.post("/activos/desecho")
def dar_baja(d: DesechoRequest):
    conn = get_db(); cur = conn.cursor()
    cur.execute("UPDATE activos SET asignado_a = NULL, area_id = NULL, estado = 'Desecho' WHERE id = %s", (d.activo_id,))
    conn.commit(); conn.close()
    registrar_evento(d.activo_id, "Baja / Desecho", f"Motivo: {d.motivo}")
    return {"status": "ok"}

@router.post("/empleados/")
def crear_empleado(emp: EmpleadoCreate):
    conn = get_db(); cur = conn.cursor(); cur.execute("INSERT INTO empleados (nombre, departamento_id) VALUES (%s, %s)", (emp.nombre, emp.departamento_id)); conn.commit(); conn.close(); return {"status": "ok"}

@router.get("/empleados/")
def listar_empleados():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor); cur.execute("SELECT id, nombre, departamento_id FROM empleados ORDER BY nombre"); res = cur.fetchall(); conn.close(); return res

@router.get("/data/departamentos")
def get_departamentos():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor); cur.execute("SELECT id, nombre FROM departamentos ORDER BY nombre"); res = cur.fetchall(); conn.close(); return res

@router.post("/mantenimientos/")
def crear_mantenimiento(m: MantenimientoCreate):
    conn = get_db(); cur = conn.cursor(); cur.execute("INSERT INTO mantenimientos (activo_id, descripcion, fecha, costo) VALUES (%s, %s, %s, %s)", (m.activo_id, m.descripcion, m.fecha, m.costo)); conn.commit(); conn.close(); registrar_evento(m.activo_id, "Mantenimiento", f"{m.descripcion}"); return {"status": "ok"}

@router.get("/mantenimientos/calendario")
def get_cal():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT m.id, m.descripcion as title, m.fecha as start, a.nombre_equipo as equipo FROM mantenimientos m JOIN activos a ON m.activo_id = a.id")
    res = cur.fetchall(); conn.close()
    for r in res: r['start'] = str(r['start']); r['title'] = f"{r['equipo']}: {r['title']}"
    return res

@router.get("/reportes_fallas")
def obtener_reportes():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    query = """
        SELECT m.id as reporte_id, m.fecha, m.descripcion, 
               a.id as activo_id, a.nombre_equipo, a.serie, 
               e.nombre as reportado_por
        FROM mantenimientos m
        JOIN activos a ON m.activo_id = a.id
        LEFT JOIN empleados e ON a.asignado_a = e.id
        WHERE m.descripcion LIKE '🚨 FALLA REPORTADA:%'
        ORDER BY m.id DESC
    """
    cur.execute(query)
    res = cur.fetchall()
    for r in res: r['fecha'] = str(r['fecha'])
    conn.close()
    return res

@router.post("/resolver_falla/{reporte_id}")
def resolver_falla(reporte_id: int):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT activo_id, descripcion FROM mantenimientos WHERE id = %s", (reporte_id,))
    mant = cur.fetchone()
    if mant:
        nueva_desc = mant['descripcion'].replace('🚨 FALLA REPORTADA:', '✅ FALLA RESUELTA:')
        cur.execute("UPDATE mantenimientos SET descripcion = %s WHERE id = %s", (nueva_desc, reporte_id))
        conn.commit()
        registrar_evento(mant['activo_id'], "Resolución TI", "El departamento de TI ha marcado la incidencia como resuelta.")
    conn.close()
    return {"status": "ok"}

# =====================================================================
# NUEVO ENDPOINT: IMPORTACIÓN MASIVA DESDE EXCEL
# =====================================================================
@router.post("/activos/importar")
async def importar_excel(file: UploadFile = File(...)):
    if not file.filename.endswith('.xlsx'):
        return {"status": "error", "msg": "El archivo debe ser un Excel (.xlsx)"}
    
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(filename=BytesIO(contents), data_only=True)
        sheet = wb.active
        
        conn = get_db()
        cur = conn.cursor()
        
        count = 0
        # Se asume el siguiente orden de columnas en el Excel:
        # Col A: Nombre | Col B: Marca | Col C: Modelo | Col D: Serie | Col E: Precio | Col F: Estado
        for i, row in enumerate(sheet.iter_rows(values_only=True)):
            if i == 0: continue # Saltar la primera fila (los encabezados)
            
            # Solo insertamos si al menos hay nombre y número de serie
            if row[0] and row[3]:
                nombre = str(row[0])
                marca = str(row[1]) if row[1] else "Genérica"
                modelo = str(row[2]) if row[2] else "Genérico"
                serie = str(row[3])
                try: 
                    precio = float(row[4])
                except: 
                    precio = 0.0
                estado_fisico = str(row[5]) if row[5] else "Nuevo"
                
                cur.execute("""
                    INSERT INTO activos (nombre_equipo, marca, modelo, serie, precio_compra, estado_fisico, fecha_ingreso, estado) 
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_DATE, 'Disponible') RETURNING id
                """, (nombre, marca, modelo, serie, precio, estado_fisico))
                
                activo_id = cur.fetchone()[0]
                registrar_evento(activo_id, "Ingreso", "Carga masiva por Excel")
                count += 1
                
        conn.commit()
        conn.close()
        return {"status": "ok", "msg": f"Se importaron {count} equipos correctamente."}
        
    except Exception as e:
        return {"status": "error", "msg": f"Error al procesar el archivo: {str(e)}"}