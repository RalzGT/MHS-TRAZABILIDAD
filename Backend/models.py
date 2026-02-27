from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class UsuarioCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    rol: str = "operador"
    departamento_id: int # NUEVO: Para enlazarlo como empleado

class EmpleadoCreate(BaseModel):
    nombre: str
    departamento_id: int

class ActivoStock(BaseModel):
    nombre_equipo: str
    marca: str
    modelo: str
    serie: str
    precio_compra: float
    estado_fisico: str

class Asignacion(BaseModel):
    activo_id: int
    empleado_id: int
    area_id: int

class MantenimientoCreate(BaseModel):
    activo_id: int
    descripcion: str
    fecha: str
    costo: float

class DevolucionRequest(BaseModel):
    activo_id: int
    estado_fisico: str

class DesechoRequest(BaseModel):
    activo_id: int
    motivo: str

class ReporteFalla(BaseModel):
    activo_id: int
    descripcion: str