const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const stubify = require('./stubify');

const PUERTO_WEB = 3000;
const PUERTO_P2P = 10000;
let nodosDisponibles = []; 
let indiceNodo = 0; 

// ==========================
// OBTENER IP (RADMIN / WIFI)
// ==========================
function getIP() {
    const interfaces = os.networkInterfaces();
    let ipRadmin = null, ipWifi = null;
    for (let iface in interfaces) {
        for (let i of interfaces[iface]) {
            if (i.family === 'IPv4' && !i.internal && !iface.toLowerCase().includes('wsl') && !iface.toLowerCase().includes('virtual')) {
                if (iface.toLowerCase().includes('radmin') || i.address.startsWith('172.26.')) ipRadmin = i.address;
                else ipWifi = i.address;
            }
        }
    }
    return ipRadmin || ipWifi || '127.0.0.1';
}

const miIp = getIP();

// ==========================
// SERVIDOR HTTP
// ==========================
const server = http.createServer(async (req, res) => {
    const urlParsed = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && urlParsed.pathname === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error al cargar index.html'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } 
    else if (req.method === 'POST' && urlParsed.pathname === '/api/crear') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const { nombreArchivo } = JSON.parse(body);
            const resultado = await procesarCreacionArchivo(nombreArchivo);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resultado));
        });
    } 
    else if (req.method === 'GET' && urlParsed.pathname === '/api/recuperar') {
        const nombre = urlParsed.searchParams.get('nombre');
        const resultado = await procesarRecuperacionArchivo(nombre);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resultado));
    }
    else {
        res.writeHead(404); res.end('No encontrado');
    }
});

// --- INICIAR SERVIDOR WEB DE INMEDIATO ---
server.listen(PUERTO_WEB, () => {
    console.log(`\n==================================================`);
    console.log(` ✅ INTERFAZ WEB LISTA: http://localhost:${PUERTO_WEB}`);
    console.log(`==================================================\n`);
});

// ==========================
// LÓGICA DE ARCHIVOS
// ==========================
async function procesarRecuperacionArchivo(nombre) {
    const dirLocal = './archivos_cliente';
    const rutaLocal = path.join(dirLocal, nombre);
    
    if (fs.existsSync(rutaLocal)) {
        return { tipo: 'exito', contenido: fs.readFileSync(rutaLocal, 'utf8'), origen: 'Local (Cliente)' };
    }

    if (nodosDisponibles.length === 0) return { tipo: 'error', mensaje: "No hay nodos en la red." };

    for (const url of nodosDisponibles) {
        try {
            const nodoRemoto = stubify(url, 'Nodo', ['leerArchivo']);
            const contenido = await nodoRemoto.leerArchivo(nombre);
            if (contenido && !contenido.startsWith("Error 404")) {
                return { tipo: 'exito', contenido: contenido, origen: `Remoto (${url})` };
            }
        } catch (e) { console.log(`[WEB] Fallo en ${url}`); }
    }
    return { tipo: 'error', mensaje: "Archivo no encontrado en la red." };
}

async function procesarCreacionArchivo(nombre) {
    if (nodosDisponibles.length === 0) return { tipo: 'error', mensaje: "Buscando nodos..." };

    const dirLocal = './archivos_cliente';
    if (!fs.existsSync(dirLocal)) fs.mkdirSync(dirLocal);
    const rutaCompleta = `${dirLocal}/${nombre}`;

    if (fs.readdirSync(dirLocal).length < 3) {
        if (fs.existsSync(rutaCompleta)) return { tipo: 'info', mensaje: "Ya existe localmente." };
        fs.writeFileSync(rutaCompleta, "Contenido web original");
        return { tipo: 'exito', mensaje: "Creado localmente." };
    } else {
        const urlDestino = nodosDisponibles[indiceNodo % nodosDisponibles.length];
        indiceNodo++;
        try {
            const nodoRemoto = stubify(urlDestino, 'Nodo', ['guardarEnDisco']);
            const res = await nodoRemoto.guardarEnDisco(nombre);
            if (res === 1) return { tipo: 'exito', mensaje: "Replicado en RED P2P." };
            return { tipo: 'error', mensaje: "Error en nodo." };
        } catch (e) {
            nodosDisponibles = nodosDisponibles.filter(n => n !== urlDestino);
            return await procesarCreacionArchivo(nombre); 
        }
    }
}

// ==========================
// DESCUBRIMIENTO P2P
// ==========================
const buscador = dgram.createSocket({ type: 'udp4', reuseAddr: true });

buscador.on('message', (msg, rinfo) => {
    const mensaje = msg.toString();
    if (mensaje.startsWith("NODO_VIVO") || mensaje.startsWith("NODO_DISPONIBLE")) {
        const puertoNodo = mensaje.split(":")[1] || "8081";
        const urlNodo = `http://${rinfo.address}:${puertoNodo}`;
        
        if (!nodosDisponibles.includes(urlNodo)) {
            nodosDisponibles.push(urlNodo);
            console.log(`[CLIENTE WEB] Nodo descubierto: ${urlNodo}`);
        }
    }
});

// Manejo de error para que no se detenga el servidor si el puerto 10000 falla
buscador.on('error', (err) => {
    console.log(`[ERROR P2P] Puerto 10000 ocupado o error de red: ${err.message}`);
});

buscador.bind(PUERTO_P2P, () => {
    buscador.setBroadcast(true);
    console.log(`[P2P] Buscando nodos activamente...`);
    
    setInterval(() => {
        buscador.send(Buffer.from("BUSCANDO_NODOS"), PUERTO_P2P, '255.255.255.255');
    }, 5000);
});