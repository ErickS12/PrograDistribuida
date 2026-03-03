const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');

// ==========================
// CONFIGURACIÓN INICIAL
// ==========================
const PUERTO = process.argv[2] ? parseInt(process.argv[2]) : 8081;
const PUERTO_P2P = 10000; // Puerto común para descubrimiento

function getIP() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let i of interfaces[iface]) {
            if (i.family === 'IPv4' && !i.internal) return i.address;
        }
    }
    return '127.0.0.1';
}

const miIp = getIP();
const miUrl = `http://${miIp}:${PUERTO}`;
let otrosNodos = [];

console.log(`[SISTEMA] Iniciando nodo en ${miUrl}`);

// ==========================
// DESCUBRIMIENTO P2P (CORREGIDO)
// ==========================
// reuseAddr permite que varios procesos escuchen el puerto 10000 simultáneamente
const p2p = dgram.createSocket({ type: 'udp4', reuseAddr: true });

p2p.on('message', (msg, rinfo) => {
    const mensaje = msg.toString();

    // 1. Alguien se anunció o respondió a nuestra búsqueda
    if (mensaje.startsWith("NODO_VIVO")) {
        const puertoRemoto = mensaje.split(":")[1];
        const urlRemota = `http://${rinfo.address}:${puertoRemoto}`;

        if (urlRemota !== miUrl && !otrosNodos.includes(urlRemota)) {
            otrosNodos.push(urlRemota);
            console.log(`[P2P] Nodo detectado y agregado: ${urlRemota}`);
            console.log(`[P2P] Lista actual: [${otrosNodos}]`);
        }
    }

    // 2. Alguien está buscando nodos activos, le respondemos directamente
    if (mensaje === "BUSCANDO_NODOS") {
        const respuesta = Buffer.from(`NODO_VIVO:${PUERTO}`);
        p2p.send(respuesta, rinfo.port, rinfo.address);
    }
});

p2p.bind(PUERTO_P2P, () => {
    p2p.setBroadcast(true);
    console.log(`[P2P] Buscando compañeros en el puerto ${PUERTO_P2P}...`);

    // Anunciar mi presencia cada 4 segundos
    setInterval(() => {
        const anuncio = Buffer.from(`NODO_VIVO:${PUERTO}`);
        p2p.send(anuncio, PUERTO_P2P, '255.255.255.255');
    }, 4000);

    // Pedir que otros se identifiquen cada 10 segundos
    setInterval(() => {
        const busqueda = Buffer.from("BUSCANDO_NODOS");
        p2p.send(busqueda, PUERTO_P2P, '255.255.255.255');
    }, 10000);
});

// ==========================
// LÓGICA DE PERSISTENCIA
// ==========================
function guardarLocal(nombre) {
    const dir = './archivos_nodo_' + PUERTO; // Directorios separados por puerto para pruebas locales
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const ruta = `${dir}/${nombre}`;
    if (fs.existsSync(ruta)) return 2; // Ya existe

    fs.writeFileSync(ruta, `Contenido replicado en nodo ${PUERTO}`);
    console.log(`[DISCO] Guardado: ${nombre}`);
    return 1;
}

// ==========================
// LÓGICA DISTRIBUIDA (RPC)
// ==========================
// En el NODO (ej. 8081, 8082...)
const nodoLogica = {
    guardarEnDisco: async (nombre) => {
        console.log(`[COORDINADOR] Recibida solicitud para: ${nombre}`);
        
        // 1. Guardar copia local 
        const resultado = guardarLocal(nombre);
        if (resultado === 2) return 2; // Ya existe, no replicamos de nuevo

        // 2. REPLICACIÓN ACTIVA: Intentar copiar en TODOS los nodos disponibles
        let replicasExitosas = 1; 

        for (const url of otrosNodos) {
            try {
                const nodoReplica = stubify(url, 'Nodo', ['guardarReplica']);
                const res = await nodoReplica.guardarReplica(nombre);
                if (res === 1 || res === 2) {
                    replicasExitosas++;
                    console.log(`[REPLICA] Copia creada con éxito en ${url}`);
                }
            } catch (err) {
                console.error(`[FALLO] No se pudo replicar en ${url}`);
            }
        }

        console.log(`[SISTEMA] Archivo '${nombre}' protegido con ${replicasExitosas} copias.`);
        return 1;
    },

    guardarReplica: async (nombre) => {
        // Este método lo llaman los otros nodos
        return guardarLocal(nombre);
    },

    // ESTO ES VITAL: Si el nodo no tiene el archivo, lo busca en los demás
    // Esto garantiza TRANSPARENCIA DE UBICACIÓN
    leerArchivo: async (nombre) => {
        const dir = './archivos_nodo_' + PUERTO;
        const ruta = `${dir}/${nombre}`;

        if (fs.existsSync(ruta)) {
            console.log(`[LECTURA] Sirviendo copia local de ${nombre}`);
            return fs.readFileSync(ruta, 'utf8');
        }

        // Si no está aquí (quizás este nodo se unió tarde), 
        // le pregunta a los demás antes de decirle "no" al cliente.
        for (const url of otrosNodos) {
            try {
                const nodoRemoto = stubify(url, 'Nodo', ['leerArchivoLocal']);
                const contenido = await nodoRemoto.leerArchivoLocal(nombre);
                if (contenido) return contenido;
            } catch (e) { continue; }
        }
        return null;
    },

    leerArchivoLocal: async (nombre) => {
        const dir = './archivos_nodo_' + PUERTO;
        const ruta = `${dir}/${nombre}`;
        return fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
    }
};
// ==========================
// SERVIDOR RPC
// ==========================
skeletonify('Nodo', nodoLogica).listen(PUERTO, () => {
    console.log(`[RPC] Servidor escuchando en puerto ${PUERTO}`);
});