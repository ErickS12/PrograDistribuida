const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');

let nodos = []; // Lista dinámica de nodos
let turno = 0;  // Para el Round-Robin

// 1. Lógica que expondremos por RPC
const gestorLogica = {
    registrarNodo: (urlNodo) => {
        if (!nodos.includes(urlNodo)) {
            nodos.push(urlNodo);
            console.log(`[REGISTRO] Nuevo nodo conectado: ${urlNodo}`);
        }
        return true;
    },
    
    recibirYDistribuirArchivo: async (nombreArchivo) => {
        if (nodos.length === 0) return 0; // 0 = Error, no hay nodos

        let intentos = 0;
        let maxNodos = nodos.length;

        while (intentos < maxNodos) {
            let urlDestino = nodos[turno];
            turno = (turno + 1) % maxNodos;

            console.log(`[BALANCEADOR] Delegando '${nombreArchivo}' a: ${urlDestino}`);
            
            // Transparencia total usando tu proxy:
            const nodoRemoto = stubify(urlDestino, 'Nodo', ['guardarEnDisco']);
            
            try {
                let respuesta = await nodoRemoto.guardarEnDisco(nombreArchivo);
                if (respuesta === 1 || respuesta === 2) return respuesta; // Éxito o ya existe
                if (respuesta === 3) {
                    console.log(` -> Nodo ${urlDestino} LLENO. Intentando otro...`);
                    intentos++;
                }
             } catch (error) {
                // Le agregamos "error.message" para ver el fallo real
                console.log(` -> Nodo ${urlDestino} caído. Motivo:`, error.message);
                intentos++;
            }
        }
        return 3; // Todos llenos
    }
};

// 2. Levantar el servidor RPC del Balanceador en puerto 9000
skeletonify('Gestor', gestorLogica).listen(9000, () => {
    console.log("[BALANCEADOR] Servidor RPC escuchando en puerto 9000");
});

// 3. Radar Multicast para ser descubierto
const radar = dgram.createSocket('udp4');
radar.on('message', (msg, rinfo) => {
    if (msg.toString() === "BUSCANDO") {
        const respuesta = Buffer.from("AQUI_ESTOY");
        radar.send(respuesta, rinfo.port, rinfo.address);
    }
});
radar.bind(10000, () => {
    radar.addMembership('231.0.0.1');
    console.log("[MULTICAST] Radar activo en 231.0.0.1:10000");
});