// Ya no necesitamos importar node-fetch, usamos el nativo de Node.js

function stubify(server, objName, methods = []) {
  let id = 1;
  const proxy = new Proxy({}, {
    ownKeys: () => methods,
    getOwnPropertyDescriptor: (target, prop) => ({ value: proxy[prop], writable: true, enumerable: true, configurable: true }),
    get: (() => {
      const cache = [];
      return (target, method) => {
        return cache[method] || (cache[method] = async (...params) => {
          const res = await fetch(`${server}/${objName}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: id++ })
          });
          const data = await res.json();
          if (res.status === 200) {
            if (data.error) throw new Error(data.error.message);
            return data.result;
          }
          throw new Error(data.error ? data.error.message : 'Error desconocido');
        });
      };
    })()
  });
  return proxy;
}

module.exports = stubify;