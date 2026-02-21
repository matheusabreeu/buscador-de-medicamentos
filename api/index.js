const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para farmácias VTEX (Extrafarma, Pague Menos, Globo)
async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariasglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=49`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return [];
        const produtos = await response.json();

        return produtos.map(p => {
            const item = p.items[0];
            const seller = item.sellers[0].commertialOffer;
            const preco = seller.Price;
            if (!preco || preco <= 0) return null;
            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.link,
                imagem: item.images[0]?.imageUrl || ''
            };
        }).filter(item => item !== null);
    } catch (error) { return []; }
}

// Função para Drogasil - Tentativa de "Bypass" com novos cabeçalhos
async function buscarDrogasil(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=50&sort_by=relevance%3Adesc`;
        
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'x-api-key': 'vli7vS4Z6U2v',
                'Origin': 'https://www.drogasil.com.br',
                'Referer': 'https://www.drogasil.com.br/',
                'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) return [];
        const data = await response.json();
        
        // A Drogasil pode retornar os produtos em diferentes chaves
        const products = data.results?.products || data.products || [];

        return products.map(p => {
            const preco = p.valueTo || p.price?.valueTo;
            if (!preco) return null;
            return {
                loja: 'Drogasil',
                nome: p.name || p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.urlKey ? `https://www.drogasil.com.br/${p.urlKey}.html` : '#',
                imagem: p.image || p.thumbnail
            };
        }).filter(item => item !== null);
    } catch (error) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    let lojasSelecionadas = req.body?.lojas;
    
    // Se nada for selecionado ou vier como string única, transformamos em array
    if (!lojasSelecionadas) {
        lojasSelecionadas = ['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'];
    } else if (!Array.isArray(lojasSelecionadas)) {
        lojasSelecionadas = [lojasSelecionadas];
    }

    let resultados = [];
    
    if (remedio) {
        const buscas = [];
        if (lojasSelecionadas.includes('Extrafarma')) buscas.push(buscarVTEX(remedio, 'Extrafarma'));
        if (lojasSelecionadas.includes('Pague Menos')) buscas.push(buscarVTEX(remedio, 'Pague Menos'));
        if (lojasSelecionadas.includes('Globo')) buscas.push(buscarVTEX(remedio, 'Globo'));
        if (lojasSelecionadas.includes('Drogasil')) buscas.push(buscarDrogasil(remedio));

        const tempResults = await Promise.all(buscas);
        resultados = tempResults.flat().sort((a, b) => a.valor - b.valor);
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
            function toggleTodas(master) {
                const checkboxes = document.getElementsByName('lojas');
                checkboxes.forEach(cb => cb.checked = master.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1">Comparador de Preços em Tempo Real</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Qual o remédio?" required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-black text-slate-500 uppercase font-bold tracking-wider">Redes</span>
                        <label class="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-blue-400">
                            <input type="checkbox" id="checkTodos" onclick="toggleTodas(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0">
                            SELECIONAR TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-3 gap-x-2">
                        ${['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'].map(loja => `
                            <label class="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" name="lojas" value="${loja}" 
                                    ${lojasSelecionadas.includes(loja) ? 'checked' : ''} 
                                    class="rounded border-slate-700 bg-slate-800 text-blue-600">
                                ${loja}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-900/20 active:scale-95">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-4">
                ${resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-3 hover:border-blue-500/50 transition">
                        <img src="${r.imagem}" class="w-12 h-12 rounded bg-white object-contain p-1">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[10px] font-bold text-slate-200 leading-tight uppercase truncate mb-1">${r.nome}</h3>
                            <div class="flex justify-between items-end">
                                <div>
                                    <p class="text-[8px] font-black tracking-tighter ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Drogasil' ? 'text-green-500' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400'))} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-lg font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-1.5 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700">VER SITE</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
                
                ${remedio && resultados.length === 0 ? '<div class="text-center p-10 text-slate-600 text-sm">Nenhum resultado encontrado.</div>' : ''}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
