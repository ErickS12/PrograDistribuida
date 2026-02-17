const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');

const PUERTO = 8081; 

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
    console.log(`[NODO] Buscando al Balanceador por la VPN...`);
});

// MULTICAST DE BÚSQUEDA FORZADO A LA VPN
const buscador = dgram.createSocket('udp4');
buscador.on('message', async (msg, rinfo) => {
    if (msg.toString() === "AQUI_ESTOY") {
        console.log(`[NODO] ¡Balanceador encontrado en ${rinfo.address}!`);
        buscador.close();
        
        const balanceadorRemoto = stubify(`http://${rinfo.address}:9000`, 'Gestor', ['registrarNodo']);
        await balanceadorRemoto.registrarNodo(miUrl);
        console.log("[NODO] ¡Registrado con éxito y listo para recibir archivos!");
    }
});

buscador.bind(() => {
    buscador.addMembership('231.0.0.1', miIp); // Escuchar respuestas por VPN
    buscador.setMulticastInterface(miIp);      // Gritar por VPN
    buscador.send(Buffer.from("BUSCANDO"), 10000, '231.0.0.1');
});