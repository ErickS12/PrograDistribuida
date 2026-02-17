const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const os = require('os');

// Escáner inteligente: Busca prioritariamente la IP de Radmin VPN
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
let nodos = [];
let turno = 0;

const gestorLogica = {
    registrarNodo: (urlNodo) => {
        if (!nodos.includes(urlNodo)) {
            nodos.push(urlNodo);
            console.log(`[REGISTRO] Nuevo nodo conectado: ${urlNodo}`);
        }
        return true;
    },
    
    recibirYDistribuirArchivo: async (nombreArchivo) => {
        if (nodos.length === 0) return 0;

        let intentos = 0;
        let maxNodos = nodos.length;

        while (intentos < maxNodos) {
            let urlDestino = nodos[turno];
            turno = (turno + 1) % maxNodos;

            console.log(`[BALANCEADOR] Delegando '${nombreArchivo}' a: ${urlDestino}`);
            const nodoRemoto = stubify(urlDestino, 'Nodo', ['guardarEnDisco']);
            
            try {
                let respuesta = await nodoRemoto.guardarEnDisco(nombreArchivo);
                if (respuesta === 1 || respuesta === 2) return respuesta; 
                if (respuesta === 3) {
                    console.log(` -> Nodo ${urlDestino} LLENO. Intentando otro...`);
                    intentos++;
                }
            } catch (error) {
                console.log(` -> Nodo ${urlDestino} caído.`);
                intentos++;
            }
        }
        return 3; 
    }
};

skeletonify('Gestor', gestorLogica).listen(9000, () => {
    console.log(`[BALANCEADOR] Servidor RPC activo (IP: ${miIp})`);
});

// RADAR MULTICAST FORZADO A LA VPN
const radar = dgram.createSocket('udp4');
radar.on('message', (msg, rinfo) => {
    if (msg.toString() === "BUSCANDO") {
        const respuesta = Buffer.from("AQUI_ESTOY");
        radar.send(respuesta, rinfo.port, rinfo.address);
    }
});
radar.bind(10000, () => {
    radar.addMembership('231.0.0.1', miIp); // <--- OBLIGAMOS A ESCUCHAR EN RADMIN
    console.log(`[MULTICAST] Radar esperando nodos en túnel VPN: ${miIp}`);
});