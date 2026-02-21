const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função de busca para Extrafarma e Pague Menos
async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        // Captura 30 produtos para garantir uma boa amostra de mercado
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=29`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.map(p => {
            const item = p.items?.[0];
            const seller = item?.sellers?.[0]?.commertialOffer;
            const preco = seller?.Price;
            
            if (!preco || preco <= 0) return null;
            
            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: `https://${dominios[loja]}${p.link}`,
                imagem: item?.images?.[0]?.imageUrl || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    // Aceita busca via formulário (body) ou link (query)
    const remedio = req.body?.remedio || req.query?.q || '';
    let lojasSelecionadas = req.body?.lojas || ['Extrafarma', 'Pague Menos'];
    if (!Array.isArray(lojasSelecionadas)) lojasSelecionadas = [lojasSelecionadas];

    let resultados = [];
    if (remedio) {
        const buscas = [];
        if (lojasSelecionadas.includes('Extrafarma')) buscas.push(buscarFarmacia(remedio, 'Extrafarma'));
        if (lojasSelecionadas.includes('Pague Menos')) buscas.push(buscarFarmacia(remedio, 'Pague Menos'));

        const tempResults = await Promise.all(buscas);
        // ORDENAÇÃO ECONÔMICA: Sempre o menor preço no topo
        resultados = tempResults.flat().sort((a, b) => a.valor - b.valor);
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu - Saúde e Economia</title>
        <script>
            function selecionarTodas(m) {
                document.getElementsByName('lojas').forEach(c => c.checked = m.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1">Sargento F Abreu | Economia UFMA</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Filtro de Redes</span>
                        <label class="flex items-center gap-1 text-[10px] font-bold text-blue-400 cursor-pointer">
                            <input type="checkbox" onclick="selecionarTodas(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0">
                            MARCAR TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-3">
                        <label class="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" name="lojas" value="Extrafarma" ${lojasSelecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600"> 
                            Extrafarma
                        </label>
                        <label class="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" name="lojas" value="Pague Menos" ${lojasSelecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-600"> 
                            Pague Menos
                        </label>
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
                                    <p class="text-[8px] font-black tracking-tighter ${r.loja === 'Extrafarma' ? 'text-blue-400' : 'text-red-400'} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-xl font-black leading-none">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700 hover:bg-slate-700 transition">🛒 SITE</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${remedio && resultados.length === 0 ? '<div class="text-center p-10 text-slate-600 text-sm italic font-medium">Nenhum resultado encontrado para as farmácias selecionadas.</div>' : ''}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
