const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const stubify = require('./stubify');

const PUERTO_WEB = 3000; // Puerto para entrar desde el navegador
let ipBalanceador = null;
let balanceadorRPC = null;

// --- 1. Configuración del Servidor Web Local ---
const server = http.createServer(async (req, res) => {
    // A) Servir el archivo HTML principal
    if (req.method === 'GET' && req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500); res.end('Error al cargar index.html'); return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } 
    // B) API que recibe la orden del navegador
    else if (req.method === 'POST' && req.url === '/api/crear') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const { nombreArchivo } = JSON.parse(body);
            const resultado = await procesarCreacionArchivo(nombreArchivo);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resultado));
        });
    } else {
        res.writeHead(404); res.end('No encontrado');
    }
});

// --- 2. Lógica Central (Transparencia) ---
async function procesarCreacionArchivo(nombre) {
    if (!ipBalanceador) {
        return { tipo: 'error', mensaje: "Aún buscando Balanceador en la red..." };
    }

    const dirLocal = './archivos_cliente';
    if (!fs.existsSync(dirLocal)) fs.mkdirSync(dirLocal);

    const archivosLocales = fs.readdirSync(dirLocal);
    const rutaCompleta = `${dirLocal}/${nombre}`;

    if (archivosLocales.length < 3) {
        // INTENTO LOCAL
        if (fs.existsSync(rutaCompleta)) {
            return { tipo: 'info', mensaje: "El archivo ya existe localmente." };
        } else {
            fs.writeFileSync(rutaCompleta, "Contenido creado desde Web");
            return { tipo: 'exito', mensaje: "Archivo creado localmente con éxito." };
        }
    } else {
        // INTENTO REMOTO (RPC Transparente)
        console.log(`[WEB] Límite local lleno. Enviando '${nombre}' a la red...`);
        try {
            const res = await balanceadorRPC.recibirYDistribuirArchivo(nombre);
            if (res === 1) return { tipo: 'exito', mensaje: "Límite local lleno. Archivo guardado en la red distribuida." };
            if (res === 2) return { tipo: 'info', mensaje: "El archivo ya existe en la red." };
            if (res === 3) return { tipo: 'error', mensaje: "ERROR: Capacidad máxima de la red alcanzada." };
            return { tipo: 'error', mensaje: "Error desconocido en la red." };
        } catch (e) {
            return { tipo: 'error', mensaje: "Fallo al conectar con el Balanceador." };
        }
    }
}

// --- 3. Inicio: Buscar Balanceador y levantar servidor web ---
console.log("[CLIENTE WEB] Iniciando... Buscando Balanceador por Multicast.");
const buscador = dgram.createSocket('udp4');

buscador.on('message', (msg, rinfo) => {
    if (msg.toString() === "AQUI_ESTOY") {
        ipBalanceador = rinfo.address;
        console.log(`[CLIENTE WEB] ¡Balanceador encontrado en ${ipBalanceador}!`);
        // Preparamos el cliente RPC usando tu librería stubify
        balanceadorRPC = stubify(`http://${ipBalanceador}:9000`, 'Gestor', ['recibirYDistribuirArchivo']);
        buscador.close();

        // Solo iniciamos el servidor web cuando ya tenemos red
        server.listen(PUERTO_WEB, () => {
            
            console.log(`   Interfaz`);
            console.log(`   Abre en tu navegador: http://localhost:${PUERTO_WEB}`);
            
        });
    }
});

buscador.bind(() => {
    buscador.addMembership('231.0.0.1');
    buscador.send(Buffer.from("BUSCANDO"), 10000, '231.0.0.1');
});