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

// Função para Drogasil
async function buscarDrogasil(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=50`;
        
        const response = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) return [];
        const data = await response.json();

        return (data.results?.products || []).map(p => {
            if (!p.valueTo) return null;
            return {
                loja: 'Drogasil',
                nome: p.name,
                preco: p.valueTo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: p.valueTo,
                link: `https://www.drogasil.com.br/${p.urlKey}.html`,
                imagem: p.image
            };
        }).filter(item => item !== null);
    } catch (error) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    const lojasSelecionadas = req.body?.lojas || ['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'];
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
            function toggleAll(master) {
                const checkboxes = document.getElementsByName('lojas');
                for (let cb of checkboxes) { cb.checked = master.checked; }
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-sm">Menor preço como prioridade estratégica</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-2xl mb-6">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-4 px-2">
                    <p class="text-xs text-slate-400 mb-2 font-bold uppercase tracking-wider">Onde pesquisar?</p>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="todos" onclick="toggleAll(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600">
                            <span class="text-blue-400 font-bold">TODOS</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Extrafarma" ${lojasSelecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600">
                            Extrafarma
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Pague Menos" ${lojasSelecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-600">
                            Pague Menos
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Drogasil" ${lojasSelecionadas.includes('Drogasil') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-green-600">
                            Drogasil
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Globo" ${lojasSelecionadas.includes('Globo') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-orange-600">
                            Globo
                        </label>
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-900/20">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-3">
                ${resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-3 hover:border-blue-500/50 transition">
                        <img src="${r.imagem}" class="w-14 h-14 rounded-lg bg-white object-contain p-1">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[11px] font-bold truncate text-slate-200">${r.nome}</h3>
                            <div class="flex justify-between items-center mt-1">
                                <div>
                                    <p class="text-[9px] font-black tracking-tighter ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Drogasil' ? 'text-green-500' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400'))} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-lg font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-bold text-blue-400 hover:bg-slate-700 border border-slate-700">🛒 SITE</a>
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
