import psycopg2
from passlib.context import CryptContext

# Configuración de conexión (Ajusta si tu contraseña es diferente)
DB_PARAMS = {
    "host": "localhost", "database": "trazabilidad",
    "user": "postgres", "password": "Ekkomain17", "port": "5432"
}

# Configuración de seguridad idéntica al backend
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def reset_admin():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        # 1. Limpiar usuario admin viejo si existe
        cur.execute("DELETE FROM usuarios WHERE username = 'admin'")
        
        # 2. Generar hash fresco y compatible
        password_plana = "admin123"
        password_encriptada = pwd_context.hash(password_plana)
        
        # 3. Insertar usuario nuevo
        cur.execute("""
            INSERT INTO usuarios (username, password, nombre_completo, rol)
            VALUES (%s, %s, %s, %s)
        """, ('admin', password_encriptada, 'Super Admin', 'admin'))
        
        conn.commit()
        print(f"✅ ÉXITO: Usuario 'admin' recreado.")
        print(f"🔑 Nueva Contraseña (Hash): {password_encriptada}")
        print("👉 Intenta iniciar sesión ahora con: admin / admin123")
        
        conn.close()
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    reset_admin()