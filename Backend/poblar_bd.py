import psycopg2
from passlib.context import CryptContext
from datetime import datetime, timedelta
import random

# TU ENLACE A NEON
NEON_URL = "postgresql://neondb_owner:npg_E3oUxCN6KqZi@ep-ancient-lake-aiim1cvt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_pass(password): return pwd_context.hash(password)

# --- DATOS DE PRUEBA ---
departamentos = ["Dirección General", "Tecnología (TI)", "Recursos Humanos", "Contabilidad y Finanzas", "Ventas", "Producción", "Logística"]

usuarios_data = [
    ("rchinchilla", "Raúl Chinchilla", "admin"), ("jperez", "Juan Pérez", "admin"), 
    ("mlopez", "María López", "admin"), ("lmartinez", "Luis Martínez", "operador"), 
    ("smartin", "Sofía Martín", "operador"), ("dramirez", "Daniel Ramírez", "operador")
]

activos_data = [
    ("Laptop ThinkPad T14", "Lenovo", "T14 Gen 2", 1250.00, "Nuevo"), 
    ("Monitor UltraSharp 24", "Dell", "U2422H", 250.00, "Usado"),
    ("Switch Catalyst 2960", "Cisco", "2960-X", 800.00, "Usado"), 
    ("Desktop OptiPlex 7090", "Dell", "7090 MFF", 850.00, "Nuevo")
]

def preparar_base_de_datos_nube():
    print("Conectando a Neon.tech en la nube... ☁️")
    conn = psycopg2.connect(NEON_URL)
    cur = conn.cursor()

    try:
        # 0. CREAR TABLAS (Porque la BD en la nube está vacía)
        print("0. Construyendo estructura de tablas...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS departamentos (
                id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL, nombre_completo VARCHAR(100) NOT NULL,
                rol VARCHAR(20) NOT NULL DEFAULT 'operador'
            );
            CREATE TABLE IF NOT EXISTS empleados (
                id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
                departamento_id INTEGER REFERENCES departamentos(id)
            );
            CREATE TABLE IF NOT EXISTS activos (
                id SERIAL PRIMARY KEY, nombre_equipo VARCHAR(100) NOT NULL,
                marca VARCHAR(50), modelo VARCHAR(50), serie VARCHAR(100) UNIQUE,
                precio_compra DECIMAL(10,2), estado_fisico VARCHAR(50),
                fecha_ingreso DATE, estado VARCHAR(50),
                asignado_a INTEGER REFERENCES empleados(id), area_id INTEGER REFERENCES departamentos(id)
            );
            CREATE TABLE IF NOT EXISTS mantenimientos (
                id SERIAL PRIMARY KEY, activo_id INTEGER REFERENCES activos(id) ON DELETE CASCADE,
                descripcion TEXT NOT NULL, fecha DATE NOT NULL, costo DECIMAL(10,2)
            );
            CREATE TABLE IF NOT EXISTS historial_activos (
                id SERIAL PRIMARY KEY, activo_id INTEGER REFERENCES activos(id) ON DELETE CASCADE,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, accion VARCHAR(50) NOT NULL, detalle TEXT
            );
        """)
        conn.commit()

        # 1. INSERTAR DEPARTAMENTOS
        print("1. Creando Departamentos...")
        depto_ids = []
        for d in departamentos:
            cur.execute("SELECT id FROM departamentos WHERE nombre = %s", (d,))
            row = cur.fetchone()
            if row: depto_ids.append(row[0])
            else:
                cur.execute("INSERT INTO departamentos (nombre) VALUES (%s) RETURNING id", (d,))
                depto_ids.append(cur.fetchone()[0])
        
        # 2. INSERTAR USUARIOS Y EMPLEADOS
        print("2. Creando Usuarios y Empleados (Clave: 123456)...")
        password_general = hash_pass("123456")
        for user in usuarios_data:
            username, nombre, rol = user
            depto_id = random.choice(depto_ids)
            cur.execute("SELECT id FROM usuarios WHERE username = %s", (username,))
            if not cur.fetchone():
                cur.execute("INSERT INTO usuarios (username, password, nombre_completo, rol) VALUES (%s, %s, %s, %s)", 
                            (username, password_general, nombre, rol))
                cur.execute("INSERT INTO empleados (nombre, departamento_id) VALUES (%s, %s)", (nombre, depto_id))
            
        # 3. INSERTAR EQUIPOS
        print("3. Generando algunos equipos iniciales...")
        for i, activo in enumerate(activos_data):
            nombre, marca, modelo, precio, estado_fisico = activo
            serie = f"SN-CLOUD-{random.randint(1000, 9999)}-{i}"
            fecha_ingreso = datetime.now() - timedelta(days=random.randint(10, 800))
            
            # Verificamos que no exista el equipo
            cur.execute("SELECT id FROM activos WHERE serie = %s", (serie,))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO activos (nombre_equipo, marca, modelo, serie, precio_compra, estado_fisico, fecha_ingreso, estado) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'Disponible') RETURNING id
                """, (nombre, marca, modelo, serie, precio, estado_fisico, fecha_ingreso.date()))
                
                activo_id = cur.fetchone()[0]
                cur.execute("INSERT INTO historial_activos (activo_id, accion, detalle) VALUES (%s, %s, %s)",
                            (activo_id, "Ingreso Inicial", "Carga inicial a BD en la Nube"))

        conn.commit()
        print("✅ ¡Conexión exitosa! Base de datos en la nube preparada y lista.")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    preparar_base_de_datos_nube()