const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');

//Puertos dinamicos
const PUERTO = process.argv[2] ? parseInt(process.argv[2]) : 8081; 

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
const miUrl = `http://${miIp}:${PUERTO}`;

const nodoLogica = {
    guardarEnDisco: (nombre) => {
        const dir = './archivos_nodo';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const archivos = fs.readdirSync(dir);
        if (archivos.length >= 3) return 3; 

        const rutaCompleta = `${dir}/${nombre}`;
        if (fs.existsSync(rutaCompleta)) return 2; 

        fs.writeFileSync(rutaCompleta, "Contenido de prueba");
        console.log(`[NODO] Archivo guardado: ${nombre}`);
        return 1; 
    }
};

skeletonify('Nodo', nodoLogica).listen(PUERTO, () => {
    console.log(`[NODO] Iniciado en ${miUrl}`);
    console.log(`[NODO] Esperando solicitudes de clientes en la red P2P...`);
});

// Broadcast para responder a clientes buscando nodos
const anunciador = dgram.createSocket('udp4');
anunciador.on('message', (msg, rinfo) => {
    if (msg.toString() === "BUSCANDO_NODOS") {
        const respuesta = Buffer.from("NODO_DISPONIBLE");
        anunciador.send(respuesta, rinfo.port, rinfo.address);
        console.log(`[NODO] Respondiendo a cliente en ${rinfo.address}`);
    }
});

anunciador.bind(10000, () => {
    anunciador.setBroadcast(true);
    console.log(`[NODO] Anunciador activo en puerto 10000`);
});