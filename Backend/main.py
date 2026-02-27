from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, usuarios, activos, eco, operaciones

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Esto permite que Netlify pueda hablar con Render
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Integrar todos los routers
app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(activos.router)
app.include_router(eco.router)
app.include_router(operaciones.router)