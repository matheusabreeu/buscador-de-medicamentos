const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariaglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=20`;
        
        const response = await fetch(url, { 
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000) 
        });
        
        if (!response.ok) return [];
        const data = await response.json();

        return data.map(p => {
            const item = p.items?.[0];
            const preco = item?.sellers?.[0]?.commertialOffer?.Price;
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
    const remedio = req.body?.remedio || '';
    let lojasSelecionadas = req.body?.lojas || ['Extrafarma', 'Pague Menos', 'Globo'];
    if (!Array.isArray(lojasSelecionadas)) lojasSelecionadas = [lojasSelecionadas];

    let resultados = [];
    if (remedio) {
        const buscas = [];
        if (lojasSelecionadas.includes('Extrafarma')) buscas.push(buscarFarmacia(remedio, 'Extrafarma'));
        if (lojasSelecionadas.includes('Pague Menos')) buscas.push(buscarFarmacia(remedio, 'Pague Menos'));
        if (lojasSelecionadas.includes('Globo')) buscas.push(buscarFarmacia(remedio, 'Globo'));

        const tempResults = await Promise.all(buscas);
        resultados = tempResults.flat().sort((a, b) => a.valor - b.valor);
    }

    // Montando a lista de resultados fora do HTML para evitar erros de símbolo
    let listaHTML = '';
    resultados.forEach(r => {
        const corLoja = r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400');
        listaHTML += `
            <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                <img src="${r.imagem}" class="w-14 h-14 rounded-lg bg-white object-contain p-1">
                <div class="flex-1 min-w-0">
                    <h3 class="text-[10px] font-bold text-slate-200 uppercase truncate">${r.nome}</h3>
                    <div class="flex justify-between items-end mt-1">
                        <div>
                            <p class="text-[8px] font-black ${corLoja} uppercase">${r.loja}</p>
                            <p class="text-green-400 font-mono text-xl font-black">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700">🛒 SITE</a>
                    </div>
                </div>
            </div>`;
    });

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu</title>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1">Monitoramento de Preços em São Luís</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="grid grid-cols-1 gap-y-2 mb-6">
                    <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Extrafarma" ${lojasSelecionadas.includes('Extrafarma') ? 'checked' : ''}> Extrafarma</label>
                    <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Pague Menos" ${lojasSelecionadas.includes('Pague Menos') ? 'checked' : ''}> Pague Menos</label>
                    <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Globo" ${lojasSelecionadas.includes('Globo') ? 'checked' : ''}> Drogarias Globo</label>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-4">${listaHTML}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
