const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');

const PUERTO = 8081; // Cambia esto a 8082, 8083 si pruebas varios en la misma PC

// Función para obtener la IP real (como en Java, pero más fácil en Node)
function getIP() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let i of interfaces[iface]) {
            // Agregamos !iface.toLowerCase().includes('virtual')
            if (i.family === 'IPv4' && !i.internal && !iface.toLowerCase().includes('wsl') && !iface.toLowerCase().includes('virtual')) {
                return i.address;
            }
        }
    }
    return '127.0.0.1';
}

const miIp = getIP();
const miUrl = `http://${miIp}:${PUERTO}`;

// 1. Lógica física del disco que expondremos por RPC
const nodoLogica = {
    guardarEnDisco: (nombre) => {
        const dir = './archivos_nodo';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const archivos = fs.readdirSync(dir);
        if (archivos.length >= 3) return 3; // Límite alcanzado

        const rutaCompleta = `${dir}/${nombre}`;
        if (fs.existsSync(rutaCompleta)) return 2; // Ya existe

        fs.writeFileSync(rutaCompleta, "Contenido de prueba");
        console.log(`[NODO] Archivo guardado: ${nombre}`);
        return 1; // Éxito
    }
};

// 2. Levantar servidor RPC del Nodo
skeletonify('Nodo', nodoLogica).listen(PUERTO, () => {
    console.log(`[NODO] Iniciado en ${miUrl}`);
});

// 3. Buscar al Balanceador por Multicast y registrarse
const buscador = dgram.createSocket('udp4');
buscador.on('message', async (msg, rinfo) => {
    if (msg.toString() === "AQUI_ESTOY") {
        console.log(`[NODO] Balanceador encontrado en ${rinfo.address}`);
        buscador.close();
        
        // Auto-registro transparente
        const balanceadorRemoto = stubify(`http://${rinfo.address}:9000`, 'Gestor', ['registrarNodo']);
        await balanceadorRemoto.registrarNodo(miUrl);
        console.log("[NODO] ¡Registrado con éxito!");
    }
});

buscador.bind(() => {
    buscador.addMembership('231.0.0.1');
    buscador.send(Buffer.from("BUSCANDO"), 10000, '231.0.0.1');
});