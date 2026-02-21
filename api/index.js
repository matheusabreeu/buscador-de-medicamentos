const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para farmácias do sistema VTEX (Extrafarma, Pague Menos, Globo)
async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariasglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=30`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
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

// Função DROGASIL - Ataque de Mimetismo Total (Servidor)
async function buscarDrogasil(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=30`;
        
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json',
                'x-api-key': 'vli7vS4Z6U2v',
                'Origin': 'https://www.drogasil.com.br',
                'Referer': 'https://www.drogasil.com.br/'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) return [];
        const data = await response.json();
        const products = data.results?.products || [];

        return products.map(p => {
            const preco = p.valueTo;
            if (!preco) return null;
            return {
                loja: 'Drogasil',
                nome: p.name,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: `https://www.drogasil.com.br/${p.urlKey}.html`,
                imagem: p.image
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    // Lógica para pré-selecionar e manter as farmácias marcadas
    let lojas = req.body?.lojas;
    if (!lojas) {
        lojas = ['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'];
    } else if (!Array.isArray(lojas)) {
        lojas = [lojas];
    }

    let resultados = [];
    if (remedio) {
        const acoes = [];
        if (lojas.includes('Extrafarma')) acoes.push(buscarVTEX(remedio, 'Extrafarma'));
        if (lojas.includes('Pague Menos')) acoes.push(buscarVTEX(remedio, 'Pague Menos'));
        if (lojas.includes('Globo')) acoes.push(buscarVTEX(remedio, 'Globo'));
        if (lojas.includes('Drogasil')) acoes.push(buscarDrogasil(remedio));

        const resTotal = await Promise.all(acoes);
        // UNIFICAÇÃO E ORDENAÇÃO GERAL (Eficiência de Mercado)
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
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
            function toggleTodas(m) {
                document.getElementsByName('lojas').forEach(c => c.checked = m.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1">Inteligência em Preços | UFMA</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-900 p-4 rounded-2xl mb-4 outline-none border border-slate-800 focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-black text-slate-500 uppercase">Redes</span>
                        <label class="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-blue-400">
                            <input type="checkbox" id="master" onclick="toggleTodas(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0">
                            TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-3">
                        ${['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'].map(l => `
                            <label class="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" name="lojas" value="${l}" ${lojas.includes(l) ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600">
                                ${l}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-900/40">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-4">
                ${resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-blue-500/50 transition">
                        <img src="${r.imagem}" class="w-14 h-14 rounded-lg bg-white object-contain p-1">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[10px] font-bold text-slate-200 leading-tight uppercase truncate mb-1">${r.nome}</h3>
                            <div class="flex justify-between items-end">
                                <div>
                                    <p class="text-[8px] font-black tracking-tighter ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Drogasil' ? 'text-green-500' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400'))} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-xl font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700">🛒 SITE</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${remedio && resultados.length === 0 ? '<div class="text-center p-10 text-slate-600 text-sm">Nenhum resultado. Tente novamente em instantes.</div>' : ''}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
