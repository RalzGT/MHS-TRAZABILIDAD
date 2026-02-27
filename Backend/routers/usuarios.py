from fastapi import APIRouter
from psycopg2.extras import RealDictCursor
from database import get_db
from security import get_password_hash
from models import UsuarioCreate

router = APIRouter()

@router.get("/usuarios")
def listar_usuarios():
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, username, nombre_completo, rol FROM usuarios ORDER BY id")
    res = cur.fetchall(); conn.close()
    return res

@router.post("/usuarios")
def crear_usuario(u: UsuarioCreate):
    conn = get_db(); cur = conn.cursor()
    try:
        # 1. Crea el usuario para el Login
        cur.execute("INSERT INTO usuarios (username, password, nombre_completo, rol) VALUES (%s, %s, %s, %s)", 
                    (u.username, get_password_hash(u.password), u.nombre_completo, u.rol))
        
        # 2. Crea el empleado automáticamente para poder asignarle equipos
        cur.execute("INSERT INTO empleados (nombre, departamento_id) VALUES (%s, %s)", 
                    (u.nombre_completo, u.departamento_id))
        
        conn.commit(); return {"status": "ok"}
    except Exception as e: 
        conn.rollback()
        return {"status": "error", "msg": str(e)}
    finally: conn.close()

@router.delete("/usuarios/{id}")
def eliminar_usuario(id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM usuarios WHERE id = %s", (id,))
    conn.commit(); conn.close()
    return {"status": "ok"}