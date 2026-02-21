const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// CONFIGURAÇÃO DE CASHBACK MÉLIUZ (Atualize os valores aqui)
const cashbackMeliuz = {
    'Extrafarma': { pct: '4%', link: 'https://www.meliuz.com.br/desconto/extrafarma' },
    'Pague Menos': { pct: '2,5%', link: 'https://www.meliuz.com.br/desconto/pague-menos' },
    'Globo': { pct: '3%', link: 'https://www.meliuz.com.br/desconto/drogaria-globo' }
};

async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariaglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + termo + '&_from=0&_to=15';
        
        const response = await fetch(url, { 
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000) 
        });
        
        if (!response.ok) return [];
        const data = await response.json();

        return data.map(p => {
            const item = p.items && p.items[0];
            const seller = item && item.sellers && item.sellers[0] && item.sellers[0].commertialOffer;
            const preco = seller && seller.Price;
            if (!preco || preco <= 0) return null;
            
            let linkFinal = p.link || "";
            if (!linkFinal.startsWith('http')) {
                linkFinal = 'https://' + dominios[loja] + linkFinal;
            }

            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: linkFinal,
                imagem: (item.images && item.images[0] && item.images[0].imageUrl) || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    let resultados = [];
    if (remedio) {
        const buscas = [];
        if (selecionadas.includes('Extrafarma')) buscas.push(buscarVTEX(remedio, 'Extrafarma'));
        if (selecionadas.includes('Pague Menos')) buscas.push(buscarVTEX(remedio, 'Pague Menos'));
        if (selecionadas.includes('Globo')) buscas.push(buscarVTEX(remedio, 'Globo'));

        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    resultados.forEach((r, index) => {
        const corLoja = r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400');
        const badgeCashback = '<span class="text-[8px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-bold ml-2">+' + cashbackMeliuz[r.loja].pct + ' Méliuz</span>';
        
        listaHTML += '<div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 mb-3 hover:border-blue-500/30 transition">' +
            '<img src="' + r.imagem + '" class="w-12 h-12 rounded-lg bg-white object-contain p-1">' +
            '<div class="flex-1 min-w-0">' +
                '<div class="flex justify-between items-start">' +
                    '<h3 class="text-[10px] font-bold text-slate-200 uppercase truncate">' + r.nome + '</h3>' +
                    (index === 0 ? '<span class="bg-green-500/20 text-green-400 text-[7px] px-2 py-0.5 rounded-full font-black uppercase">Melhor Preço</span>' : '') +
                '</div>' +
                '<div class="flex justify-between items-end mt-1">' +
                    '<div>' +
                        '<div class="flex items-center">' +
                            '<p class="text-[8px] font-black ' + corLoja + ' uppercase tracking-tighter">' + r.loja + '</p>' + badgeCashback +
                        '</div>' +
                        '<p class="text-green-400 font-mono text-xl font-black mt-1">' + r.preco + '</p>' +
                    '</div>' +
                    '<a href="' + r.link + '" target="_blank" class="bg-blue-600 px-3 py-2 rounded-xl text-[9px] font-bold text-white shadow-lg shadow-blue-900/40">COMPRAR</a>' +
                '</div>' +
            '</div>' +
        '</div>';
    });

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💊</text></svg>">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador de Medicamentos</title>
        <script>
            function toggleAll(m) {
                document.getElementsByName('lojas').forEach(c => c.checked = m.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador de Medicamentos 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1 font-bold italic">Melhores descontos para a Família Abreu</p>
            </header>

            <div class="mb-6">
                <h4 class="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 text-center">Cashback Méliuz Hoje</h4>
                <div class="grid grid-cols-3 gap-2">
                    <a href="${cashbackMeliuz['Extrafarma'].link}" target="_blank" class="bg-blue-900/10 border border-blue-800/30 p-2 rounded-xl text-center hover:bg-blue-900/20 transition">
                        <p class="text-[7px] text-blue-400 font-bold uppercase">Extrafarma</p>
                        <p class="text-sm font-black text-white">${cashbackMeliuz['Extrafarma'].pct}</p>
                    </a>
                    <a href="${cashbackMeliuz['Pague Menos'].link}" target="_blank" class="bg-red-900/10 border border-red-800/30 p-2 rounded-xl text-center hover:bg-red-900/20 transition">
                        <p class="text-[7px] text-red-400 font-bold uppercase">Pague Menos</p>
                        <p class="text-sm font-black text-white">${cashbackMeliuz['Pague Menos'].pct}</p>
                    </a>
                    <a href="${cashbackMeliuz['Globo'].link}" target="_blank" class="bg-orange-900/10 border border-orange-800/30 p-2 rounded-xl text-center hover:bg-orange-900/20 transition">
                        <p class="text-[7px] text-orange-400 font-bold uppercase">Globo</p>
                        <p class="text-sm font-black text-white">${cashbackMeliuz['Globo'].pct}</p>
                    </a>
                </div>
                <p class="text-center text-[7px] text-slate-600 mt-2 uppercase italic">Clique no card para ativar antes de comprar</p>
            </div>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtro</span>
                        <label class="flex items-center gap-1 text-[10px] font-bold text-blue-400 cursor-pointer uppercase">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"> Todas
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-3">
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600"> Extrafarma</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-600"> Pague Menos</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Globo" ${selecionadas.includes('Globo') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-orange-500"> Globo</label>
                        <div class="flex flex-col">
                           <label class="flex items-center gap-2 text-xs opacity-50"><input type="checkbox" disabled class="rounded border-slate-700 bg-slate-800"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-[8px] text-green-500 font-bold mt-1 underline">Ir Manualmente →</a>
                        </div>
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-900/40">🔍 Buscar Menor Preço</button>
            </form>

            <div class="space-y-4">${listaHTML}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
