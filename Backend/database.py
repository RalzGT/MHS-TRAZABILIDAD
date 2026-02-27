import psycopg2

# TU NUEVA BASE DE DATOS EN LA NUBE
NEON_URL = "postgresql://neondb_owner:npg_E3oUxCN6KqZi@ep-ancient-lake-aiim1cvt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

def get_db():
    # Nos conectamos a Neon directamente
    return psycopg2.connect(NEON_URL)

def registrar_evento(activo_id, accion, detalle):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO historial_activos (activo_id, accion, detalle) VALUES (%s, %s, %s)", 
                (activo_id, accion, detalle))
    conn.commit()
    conn.close()