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
        
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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

// Função Ajustada para Drogasil (RD-Saúde)
async function buscarDrogasil(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        // Usamos o gateway oficial de busca deles
        const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=50&sort_by=relevance%3Adesc`;
        
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Origin': 'https://www.drogasil.com.br',
                'Referer': 'https://www.drogasil.com.br/'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) return [];
        const data = await response.json();

        // A estrutura da Drogasil pode variar, então buscamos de forma segura
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
    // Pegamos as lojas marcadas ou definimos o padrão (todas)
    const lojasSelecionadas = req.body?.lojas ? (Array.isArray(req.body.lojas) ? req.body.lojas : [req.body.lojas]) : ['Extrafarma', 'Pague Menos', 'Drogasil', 'Globo'];
    let resultados = [];
    
    if (remedio) {
        const buscas = [];
        if (lojasSelecionadas.includes('Extrafarma')) buscas.push(buscarVTEX(remedio, 'Extrafarma'));
        if (lojasSelecionadas.includes('Pague Menos')) buscas.push(buscarVTEX(remedio, 'Pague Menos'));
        if (lojasSelecionadas.includes('Globo')) buscas.push(buscarVTEX(remedio, 'Globo'));
        if (lojasSelecionadas.includes('Drogasil')) buscas.push(buscarDrogasil(remedio));

        const tempResults = await Promise.all(buscas);
        // Prioridade Estratégica: Sempre listar do menor para o maior preço
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
            function selecionarTodos(master) {
                const checkboxes = document.getElementsByName('lojas');
                checkboxes.forEach(cb => cb.checked = master.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-xs mt-1">Sargento F Abreu | Economia UFMA</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-2xl mb-6">
                <input type="text" name="remedio" value="${remedio}" placeholder="Qual o remédio?" required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-5 px-1">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Farmácias</span>
                        <label class="text-[10px] text-blue-400 font-bold flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" id="todos" onclick="selecionarTodos(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0">
                            MARCAR TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-2 text-xs">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Extrafarma" ${lojasSelecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-500">
                            Extrafarma
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Pague Menos" ${lojasSelecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-500">
                            Pague Menos
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Drogasil" ${lojasSelecionadas.includes('Drogasil') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-green-500">
                            Drogasil
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="lojas" value="Globo" ${lojasSelecionadas.includes('Globo') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-orange-500">
                            Drogarias Globo
                        </label>
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition active:scale-95">
                    🔍 Encontrar Menor Preço
                </button>
            </form>

            <div class="space-y-3">
                ${resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-3">
                        <img src="${r.imagem}" class="w-12 h-12 rounded bg-white object-contain p-0.5">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-[10px] font-bold text-slate-200 truncate uppercase">${r.nome}</h3>
                            <div class="flex justify-between items-center mt-1">
                                <div>
                                    <p class="text-[8px] font-black tracking-tight ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Drogasil' ? 'text-green-500' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400'))} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-lg font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-bold text-blue-400 border border-slate-700">🛒 SITE</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
                
                ${remedio && resultados.length === 0 ? '<div class="p-8 text-center text-slate-500 text-sm">Nenhum resultado encontrado. Verifique a conexão.</div>' : ''}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
