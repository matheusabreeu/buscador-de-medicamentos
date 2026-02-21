const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para buscar nas farmácias que funcionam via servidor (VTEX)
async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariasglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=25`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return [];
        const produtos = await response.json();

        return produtos.map(p => {
            const item = p.items[0];
            const preco = item.sellers[0].commertialOffer.Price;
            if (!preco || preco <= 0) return null;
            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.link,
                imagem: item.images[0]?.imageUrl || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    let lojas = req.body?.lojas || ['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'];
    if (!Array.isArray(lojas)) lojas = [lojas];

    let resultadosIniciais = [];
    if (remedio) {
        const buscasServidor = [];
        if (lojas.includes('Extrafarma')) buscasServidor.push(buscarVTEX(remedio, 'Extrafarma'));
        if (lojas.includes('Pague Menos')) buscasServidor.push(buscarVTEX(remedio, 'Pague Menos'));
        if (lojas.includes('Globo')) buscasServidor.push(buscarVTEX(remedio, 'Globo'));

        const parciais = await Promise.all(buscasServidor);
        resultadosIniciais = parciais.flat();
    }
    
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu</title>
        <script>
            // FUNÇÃO ESPECIAL: Busca Drogasil direto do navegador do usuário
            async function buscarDrogasilLocal(medicamento) {
                if (!medicamento) return;
                const termo = encodeURIComponent(medicamento);
                const url = "https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=" + termo + "&limit=20";
                
                try {
                    const response = await fetch(url, {
                        headers: { 'x-api-key': 'vli7vS4Z6U2v' }
                    });
                    const data = await response.json();
                    const products = data.results?.products || [];
                    
                    const container = document.getElementById('lista-resultados');
                    
                    products.forEach(p => {
                        const preco = p.valueTo;
                        if (!preco) return;
                        
                        const itemHtml = \`
                            <div class="bg-slate-900 p-4 rounded-2xl border border-green-900/30 flex items-center gap-4 hover:border-green-500/50 transition item-remedio" data-valor="\${preco}">
                                <img src="\${p.image}" class="w-14 h-14 rounded-lg bg-white object-contain p-1">
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-[10px] font-bold text-slate-200 uppercase truncate mb-1">\${p.name}</h3>
                                    <div class="flex justify-between items-end">
                                        <div>
                                            <p class="text-[8px] font-black text-green-500 uppercase tracking-tighter">DROGASIL</p>
                                            <p class="text-green-400 font-mono text-xl font-black leading-none">R$ \${preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <a href="https://www.drogasil.com.br/\${p.urlKey}.html" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700 hover:bg-slate-700 transition">🛒 SITE</a>
                                    </div>
                                </div>
                            </div>\`;
                        container.insertAdjacentHTML('beforeend', itemHtml);
                    });
                    
                    ordenarPorPreco();
                } catch (e) {
                    console.error("Erro na Drogasil:", e);
                }
            }

            function ordenarPorPreco() {
                const container = document.getElementById('lista-resultados');
                const itens = Array.from(container.getElementsByClassName('item-remedio'));
                itens.sort((a, b) => parseFloat(a.dataset.valor) - parseFloat(b.dataset.valor));
                itens.forEach(it => container.appendChild(it));
                document.getElementById('status').innerText = "Comparação concluída com sucesso!";
            }

            window.onload = () => {
                const remedio = "${remedio}";
                const buscarDrog = ${lojas.includes('Drogasil')};
                if (remedio && buscarDrog) {
                    buscarDrogasilLocal(remedio);
                } else if (remedio) {
                    ordenarPorPreco();
                }
            };
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1">Economia para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-6">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="grid grid-cols-2 gap-y-3">
                        ${['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'].map(l => `
                            <label class="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" name="lojas" value="${l}" ${lojas.includes(l) ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600">
                                ${l}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-900/40 active:scale-95">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            ${remedio ? '<p id="status" class="text-center text-[10px] text-blue-400 mb-4 animate-pulse uppercase font-bold tracking-widest">Aguardando Drogasil...</p>' : ''}

            <div id="lista-resultados" class="space-y-4">
                ${resultadosIniciais.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-blue-500/50 transition item-remedio" data-valor="${r.valor}">
                        <img src="${r.imagem}" class="w-14 h-14 rounded-lg bg-white object-contain p-1">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[10px] font-bold text-slate-200 leading-tight uppercase truncate mb-1">${r.nome}</h3>
                            <div class="flex justify-between items-end">
                                <div>
                                    <p class="text-[8px] font-black tracking-tighter ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400')} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-xl font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700">🛒 SITE</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
