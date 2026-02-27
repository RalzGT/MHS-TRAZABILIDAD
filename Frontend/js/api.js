const API_BASE_URL = "http://127.0.0.1:8000";

let chart = null;
let empCache = [];
let deptoCache = [];
let actsDisponibles = [];
let inventarioActual = [];
let statsData = null;
let ecoData = null;
let calendar = null;
let globalViewMode = 'asignados'; 
let currentUserRole = '';
let currentAssetDetails = null;

const defaultStats = { 
    general: { total:0, asignados:0, valor_asignados:"0.00", deptos_count:0, chart_labels:[], chart_values:[] }, 
    bodega: { total:0, valor:"0.00", nuevos:0, usados:0, chart_labels:[], chart_values:[] } 
};