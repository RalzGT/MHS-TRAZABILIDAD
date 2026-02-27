from fastapi import APIRouter
from psycopg2.extras import RealDictCursor
from datetime import datetime
from database import get_db

router = APIRouter()

@router.get("/dashboard/stats")
def get_stats():
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM activos WHERE estado != 'Desecho'"); total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM activos WHERE asignado_a IS NOT NULL AND estado != 'Desecho'"); asignados = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(SUM(precio_compra), 0) FROM activos WHERE asignado_a IS NOT NULL AND estado != 'Desecho'"); inv_asig = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT area_id) FROM activos WHERE area_id IS NOT NULL AND estado != 'Desecho'"); deptos = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM activos WHERE asignado_a IS NULL AND estado != 'Desecho'"); bod_tot = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(SUM(precio_compra), 0) FROM activos WHERE asignado_a IS NULL AND estado != 'Desecho'"); inv_bod = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM activos WHERE asignado_a IS NULL AND estado_fisico = 'Nuevo' AND estado != 'Desecho'"); bod_new = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM activos WHERE asignado_a IS NULL AND estado_fisico != 'Nuevo' AND estado != 'Desecho'"); bod_old = cur.fetchone()[0]
    cur.execute("SELECT d.nombre, COUNT(a.id) FROM activos a JOIN departamentos d ON a.area_id = d.id WHERE a.asignado_a IS NOT NULL AND a.estado != 'Desecho' GROUP BY d.nombre"); d_data = cur.fetchall()
    cur.execute("SELECT estado_fisico, COUNT(*) FROM activos WHERE asignado_a IS NULL AND estado != 'Desecho' GROUP BY estado_fisico"); e_data = cur.fetchall()
    conn.close()
    return {"general": {"total": total, "asignados": asignados, "valor_asignados": f"{inv_asig:,.2f}", "deptos_count": deptos, "chart_labels": [c[0] for c in d_data], "chart_values": [c[1] for c in d_data]}, "bodega": {"total": bod_tot, "valor": f"{inv_bod:,.2f}", "nuevos": bod_new, "usados": bod_old, "chart_labels": [c[0] for c in e_data], "chart_values": [c[1] for c in e_data]}}

@router.get("/dashboard/eco")
def get_eco_stats():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT a.precio_compra, a.fecha_ingreso, d.nombre as area, COUNT(m.id) as mants FROM activos a LEFT JOIN departamentos d ON a.area_id = d.id LEFT JOIN mantenimientos m ON a.id = m.activo_id WHERE a.estado != 'Desecho' GROUP BY a.id, d.nombre, a.precio_compra, a.fecha_ingreso")
    activos = cur.fetchall(); total_co2 = 0.0; deptos_co2 = {}
    hoy = datetime.now().date()
    for a in activos:
        precio = float(a['precio_compra'] or 0); years = (hoy - a['fecha_ingreso']).days / 365
        fabricacion = precio * 0.45; uso_anual = max(5.0, 15.5 - (a['mants'] * 5.0))
        item_co2 = fabricacion + (years * uso_anual) + (precio * 0.05)
        total_co2 += item_co2
        area = a['area'] or "Bodega"
        deptos_co2[area] = deptos_co2.get(area, 0) + item_co2
    conn.close()
    return {"total_co2": f"{total_co2:,.2f}", "arboles": int(total_co2 / 20), "energia": f"{total_co2 * 0.85:,.0f}", "chart_labels": list(deptos_co2.keys()), "chart_values": [round(v, 2) for v in deptos_co2.values()]}

@router.get("/dashboard/alertas")
def get_alertas():
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM activos a LEFT JOIN mantenimientos m ON a.id = m.activo_id WHERE (m.fecha < CURRENT_DATE - INTERVAL '180 days' OR m.fecha IS NULL) AND a.fecha_ingreso < CURRENT_DATE - INTERVAL '180 days' AND a.estado != 'Baja' AND a.estado != 'Desecho'")
    c = cur.fetchone()[0]; conn.close(); return {"alertas": c}