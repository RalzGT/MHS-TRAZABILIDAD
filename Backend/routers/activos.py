from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
import io
from database import get_db
from psycopg2.extras import RealDictCursor

router = APIRouter()

@router.get("/activos")
def get_activos():
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM activos ORDER BY id ASC")
    activos = cur.fetchall()
    conn.close()
    return activos

@router.post("/importar-activos")
async def importar_activos(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un documento de Excel válido")
    
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Limpiamos los nombres de las columnas por si traen espacios extra
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
            
            # 2. Insertamos el historial apuntando al ID correcto
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
        # ESTE MENSAJE NOS CONFIRMARÁ SI EL SERVIDOR SE ACTUALIZÓ
        raise HTTPException(status_code=500, detail=f"Error en BD (Backend Actualizado): {str(e)}")

@router.get("/historial/{activo_id}")
def get_historial(activo_id: int):
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM historial_activos WHERE activo_id = %s ORDER BY fecha DESC", (activo_id,))
    historial = cur.fetchall()
    conn.close()
    return historial