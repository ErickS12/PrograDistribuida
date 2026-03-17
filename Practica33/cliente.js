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
        // Nota: Aumentar memoria si se envían archivos muy grandes
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { nombreArchivo, contenidoBase64 } = JSON.parse(body);
                const resultado = await procesarCreacionArchivo(nombreArchivo, contenidoBase64);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(resultado));
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ tipo: 'error', mensaje: 'Error al procesar el archivo.' }));
            }
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
        // Leemos el archivo y lo convertimos a Base64
        const contenidoB64 = fs.readFileSync(rutaLocal).toString('base64');
        return { tipo: 'exito', contenido: contenidoB64, origen: 'Local (Cliente)' };
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
// ==========================
// LÓGICA DE ARCHIVOS (Reemplazar)
// ==========================
async function procesarCreacionArchivo(nombre, contenidoBase64) {
    if (nodosDisponibles.length === 0) return { tipo: 'error', mensaje: "Buscando nodos en la red... Intenta de nuevo en unos segundos." };

    // Carpeta con nombre descriptivo para los archivos que sube o descarga el cliente
    const dirLocal = './archivos_cliente_web';
    if (!fs.existsSync(dirLocal)) fs.mkdirSync(dirLocal);
    const rutaCompleta = `${dirLocal}/${nombre}`;

    // Guardamos una copia local como caché para el cliente web
    if (!fs.existsSync(rutaCompleta)) {
        fs.writeFileSync(rutaCompleta, Buffer.from(contenidoBase64, 'base64'));
    }

    // SIEMPRE enviamos a la red P2P para asegurar la distribución y réplica
    const urlDestino = nodosDisponibles[indiceNodo % nodosDisponibles.length];
    indiceNodo++;

    try {
        const nodoRemoto = stubify(urlDestino, 'Nodo', ['guardarEnDisco']);
        const res = await nodoRemoto.guardarEnDisco(nombre, contenidoBase64);
        if (res === 1 || res === 2) {
            return { tipo: 'exito', mensaje: "Archivo guardado localmente y distribuido en la red P2P." };
        }
        return { tipo: 'error', mensaje: "Error al guardar en el nodo de la red." };
    } catch (e) {
        console.log(`[WEB] Nodo falló: ${urlDestino}. Intentando con otro...`);
        nodosDisponibles = nodosDisponibles.filter(n => n !== urlDestino);
        return await procesarCreacionArchivo(nombre, contenidoBase64); // Reintento recursivo
    }
}

// ==========================
// DESCUBRIMIENTO P2P (Reemplazar)
// ==========================
const buscador = dgram.createSocket({ type: 'udp4', reuseAddr: true });

buscador.on('message', (msg, rinfo) => {
    const mensaje = msg.toString();
    
    // Ahora escuchamos correctamente el broadcast que emite nodo.js
    if (mensaje.startsWith("NODO_VIVO")) {
        const puertoRemoto = mensaje.split(":")[1];
        const urlNodo = `http://${rinfo.address}:${puertoRemoto}`;

        if (!nodosDisponibles.includes(urlNodo)) {
            nodosDisponibles.push(urlNodo);
            console.log(`[CLIENTE WEB] ¡Nodo detectado en red P2P! -> ${urlNodo}`);
        }
    }
});

buscador.on('error', (err) => {
    console.log(`[ERROR P2P] Puerto ocupado o error de red: ${err.message}`);
});

buscador.bind(PUERTO_P2P, () => {
    buscador.setBroadcast(true);
    console.log(`[P2P] Buscando nodos activamente en el puerto ${PUERTO_P2P}...`);
    
    setInterval(() => {
        buscador.send(Buffer.from("BUSCANDO_NODOS"), PUERTO_P2P, '255.255.255.255');
    }, 5000);
});