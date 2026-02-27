from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor
from typing import Optional
from datetime import datetime
import pandas as pd
import qrcode
from io import BytesIO
import io
from database import get_db

router = APIRouter()

@router.get("/activos/mis_equipos/{username}")
def mis_equipos(username: str):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT nombre_completo FROM usuarios WHERE username = %s", (username,))
    user = cur.fetchone()
    if not user: return []
    
    q = """
        SELECT a.id, a.nombre_equipo, a.marca, a.serie, a.estado_fisico 
        FROM activos a 
        JOIN empleados e ON a.asignado_a = e.id 
        WHERE e.nombre = %s AND a.estado != 'Desecho'
    """
    cur.execute(q, (user['nombre_completo'],))
    res = cur.fetchall(); conn.close()
    return res

@router.get("/activos/entregados")
def listar_entregados(buscar: Optional[str] = None):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    q = "SELECT a.id, a.nombre_equipo, a.marca, a.serie, a.fecha_ingreso, a.precio_compra, a.estado_fisico, a.estado as estado_activo, e.nombre as responsable, d.nombre as area, (SELECT MAX(fecha) FROM mantenimientos WHERE activo_id = a.id) as last_mant FROM activos a LEFT JOIN empleados e ON a.asignado_a = e.id LEFT JOIN departamentos d ON a.area_id = d.id"
    if buscar: q += f" WHERE e.nombre ILIKE '%{buscar}%' OR a.serie ILIKE '%{buscar}%' OR a.nombre_equipo ILIKE '%{buscar}%'"
    cur.execute(q + " ORDER BY a.id DESC"); activos = cur.fetchall(); hoy = datetime.now().date()
    for a in activos:
        ref = a['last_mant'] or a['fecha_ingreso']
        a['necesita_mant'] = (hoy - ref).days > 180
        a['es_obsoleto'] = (hoy - a['fecha_ingreso']).days >= 1825
        a['fecha_ingreso'] = str(a['fecha_ingreso'])
        if not a['responsable']: a['responsable'] = "Bodega Central"; a['en_bodega'] = True 
        else: a['en_bodega'] = False
        if not a['area']: a['area'] = "Almacenamiento"
    conn.close(); return activos

@router.get("/activos/disponibles")
def listar_disponibles():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, nombre_equipo, serie, marca, modelo FROM activos WHERE asignado_a IS NULL AND estado != 'Desecho'")
    res = cur.fetchall(); conn.close(); return res

@router.get("/activos/{id}/detalles")
def get_detalles(id: int):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT a.*, e.nombre as resp_actual FROM activos a LEFT JOIN empleados e ON a.asignado_a = e.id WHERE a.id = %s", (id,))
    eq = cur.fetchone()
    
    cur.execute("SELECT fecha, accion, detalle FROM historial_activos WHERE activo_id = %s ORDER BY fecha DESC", (id,))
    historial = cur.fetchall(); duenos = []
    for h in historial: 
        h['fecha'] = str(h['fecha'])[:10]
        if h['accion'] == 'Asignación' and 'Asignado a: ' in h['detalle']:
            n = h['detalle'].replace('Asignado a: ', '')
            if n not in duenos and n != eq['resp_actual']: duenos.append(n)

    cur.execute("SELECT descripcion, fecha, costo FROM mantenimientos WHERE activo_id = %s ORDER BY fecha ASC", (id,))
    mant = cur.fetchall()

    precio = float(eq['precio_compra'] or 0); fecha_ing = eq['fecha_ingreso']
    anio_compra = fecha_ing.year; val_actual = 0
    chart_labels = []; chart_data = []
    for i in range(6):
        a = anio_compra + i; v = max(0, precio - (precio / 5) * i)
        chart_labels.append(str(a)); chart_data.append(v)
        if a == datetime.now().year: val_actual = v

    mants_qty = len(mant); fabricacion = round(precio * 0.45, 2)
    uso_anual_real = max(5.0, 15.5 - (mants_qty * 5.0))
    anos_pasados = (datetime.now().date() - fecha_ing).days / 365.0
    co2_actual = round(fabricacion + (anos_pasados * uso_anual_real), 2)
    desecho = round(precio * 0.05, 2)
    co2_total_proyectado = round(fabricacion + (5.0 * uso_anual_real) + desecho, 2)

    co2_labels = []; co2_data = []; co2_acum = fabricacion
    for i in range(6):
        a = anio_compra + i; co2_labels.append(str(a))
        if i > 0:
            co2_acum += uso_anual_real
            if i == 5: co2_acum += desecho
        co2_data.append(round(co2_acum, 2))

    # =======================================================
    # ALGORITMO PREDICTIVO DE RIESGO DE FALLA (NIVEL SENIOR)
    # =======================================================
    riesgo = 5.0 # Riesgo base
    
    # 1. Factor de Antigüedad (12% de riesgo extra por cada año)
    riesgo += (anos_pasados * 12.0)
    
    # 2. Factor de Reparaciones previas (15% por cada mantenimiento/falla)
    riesgo += (mants_qty * 15.0)
    
    # 3. Factor de Estado Físico
    est = str(eq.get('estado_fisico', '')).lower()
    if 'usado' in est or 'malo' in est:
        riesgo += 20.0
    elif 'reacondicionado' in est:
        riesgo += 10.0
        
    riesgo = min(riesgo, 98.0) # Tope máximo (ningún equipo está 100% roto hasta que se da de baja)
    
    # Clasificación de la IA
    if riesgo < 35:
        ia_estado = "Óptimo"
        ia_color = "success"
        ia_sugerencia = "Equipo operando con normalidad. Probabilidad de falla mínima."
    elif riesgo < 65:
        ia_estado = "Desgaste Moderado"
        ia_color = "warning"
        ia_sugerencia = "Realizar mantenimientos preventivos regulares. Vigilar componentes móviles."
    else:
        ia_estado = "Riesgo Crítico"
        ia_color = "danger"
        ia_sugerencia = "Alta probabilidad de falla inminente. Sugerencia: Presupuestar su reemplazo inmediato."

    prediccion = {
        "riesgo_pct": round(riesgo, 1),
        "estado": ia_estado,
        "color": ia_color,
        "sugerencia": ia_sugerencia
    }

    conn.close()
    return {
        "equipo": eq, "mantenimientos": mant, "historial": historial, "duenos_anteriores": duenos,
        "finanzas": {"chart_labels": chart_labels, "chart_data": chart_data, "valor_actual": f"${val_actual:,.2f}"},
        "eco": {"fabricacion": fabricacion, "uso_anual": uso_anual_real, "actual": co2_actual, "desecho": desecho, "total_proyectado": co2_total_proyectado, "co2_labels": co2_labels, "co2_data": co2_data},
        "fecha_adquisicion": str(fecha_ing),
        "prediccion_ia": prediccion  # Enviamos el análisis al Frontend
    }

@router.get("/activos/{id}/qr")
def generar_qr(id: int):
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT nombre_equipo, serie FROM activos WHERE id = %s", (id,)); data = cur.fetchone(); conn.close()
    img = qrcode.make(f"MHS ASSETS\nID: {id}\nEquipo: {data['nombre_equipo']}\nSerie: {data['serie']}")
    buf = BytesIO(); img.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

@router.post("/importar-activos")
async def importar_activos(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un documento de Excel válido")
    
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Limpiamos las columnas
        df.columns = [c.strip() for c in df.columns]
        
        conn = get_db()
        cur = conn.cursor()
        activos_importados = 0
        
        for _, row in df.iterrows():
            # 1. Insertamos el activo y pedimos el ID real
            query_activo = """
                INSERT INTO activos (nombre, marca, modelo, serie, precio, estado)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """
            cur.execute(query_activo, (
                str(row['Nombre']), 
                str(row['Marca']), 
                str(row['Modelo']), 
                str(row['Serie']), 
                float(row['Precio']), 
                str(row['Estado'])
            ))
            
            nuevo_activo_id = cur.fetchone()[0]
            
            # 2. Insertamos el historial usando el ID correcto
            query_historial = """
                INSERT INTO historial_activos (activo_id, detalle, fecha)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
            """
            cur.execute(query_historial, (
                nuevo_activo_id, 
                f"Carga inicial mediante Excel. Serie: {row['Serie']}"
            ))
            
            activos_importados += 1
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"msg": f"Éxito: Se importaron {activos_importados} activos correctamente."}
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        # Este mensaje confirmará que corregimos el archivo correcto
        raise HTTPException(status_code=500, detail=f"Error en BD Corregida: {str(e)}")