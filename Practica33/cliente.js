const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const stubify = require('./stubify');

const PUERTO_WEB = 3000; 
let ipBalanceador = null;
let balanceadorRPC = null;

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

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error al cargar index.html'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.method === 'POST' && req.url === '/api/crear') {
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

async function procesarCreacionArchivo(nombre) {
    if (!ipBalanceador) return { tipo: 'error', mensaje: "Aún buscando Balanceador en la red..." };

    const dirLocal = './archivos_cliente';
    if (!fs.existsSync(dirLocal)) fs.mkdirSync(dirLocal);
    const archivosLocales = fs.readdirSync(dirLocal);
    const rutaCompleta = `${dirLocal}/${nombre}`;

    if (archivosLocales.length < 3) {
        if (fs.existsSync(rutaCompleta)) return { tipo: 'info', mensaje: "El archivo ya existe localmente." };
        fs.writeFileSync(rutaCompleta, "Contenido web");
        return { tipo: 'exito', mensaje: "Archivo creado localmente con éxito." };
    } else {
        console.log(`[WEB] Límite local lleno. Enviando '${nombre}' a la red...`);
        try {
            const res = await balanceadorRPC.recibirYDistribuirArchivo(nombre);
            if (res === 1) return { tipo: 'exito', mensaje: "Límite local lleno. Archivo guardado en la RED distribuida." };
            if (res === 2) return { tipo: 'info', mensaje: "El archivo ya existe en la RED." };
            if (res === 3) return { tipo: 'error', mensaje: "ERROR: Capacidad máxima de la red alcanzada." };
            return { tipo: 'error', mensaje: "Error desconocido en la red." };
        } catch (e) { return { tipo: 'error', mensaje: "Fallo al conectar con el Balanceador." }; }
    }
}

console.log(`[CLIENTE WEB] Iniciando en VPN ${miIp}... Buscando Balanceador.`);
const buscador = dgram.createSocket('udp4');

buscador.on('message', (msg, rinfo) => {
    if (msg.toString() === "AQUI_ESTOY") {
        ipBalanceador = rinfo.address;
        console.log(`[CLIENTE WEB] ¡Balanceador encontrado en ${ipBalanceador}!`);
        balanceadorRPC = stubify(`http://${ipBalanceador}:9000`, 'Gestor', ['recibirYDistribuirArchivo']);
        buscador.close();

        server.listen(PUERTO_WEB, () => {
            console.log(`\n==================================================`);
            console.log(`   ✅ INTERFAZ WEB LISTA`);
            console.log(`   👉 Abre en tu navegador: http://localhost:${PUERTO_WEB}`);
            console.log(`==================================================\n`);
        });
    }
});

buscador.bind(() => {
    buscador.addMembership('231.0.0.1', miIp);
    buscador.setMulticastInterface(miIp);
    buscador.send(Buffer.from("BUSCANDO"), 10000, '231.0.0.1');
});