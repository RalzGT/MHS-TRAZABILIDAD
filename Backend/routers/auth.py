from fastapi import APIRouter
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext
from database import get_db

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Buscamos el usuario y el ID del empleado relacionado (si existe)
    query = """
        SELECT u.password, u.nombre_completo, u.rol, e.id as empleado_id
        FROM usuarios u
        LEFT JOIN empleados e ON u.nombre_completo = e.nombre
        WHERE u.username = %s
    """
    cur.execute(query, (req.username,))
    user = cur.fetchone()
    conn.close()

    if user and pwd_context.verify(req.password, user['password']):
        # Devolvemos la información incluyendo el empleado_id que pedía el frontend
        return {
            "auth": True, 
            "user": user['nombre_completo'], 
            "rol": user['rol'], 
            "empleado_id": user['empleado_id']
        }
    
    return {"auth": False, "msg": "Credenciales incorrectas"}