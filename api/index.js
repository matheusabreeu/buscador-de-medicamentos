const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função Central para Farmácias VTEX (Extrafarma, Pague Menos, Globo)
async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Globo': 'www.drogariaglobo.com.br'
        };
        const termo = encodeURIComponent(medicamento);
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=25`;
        
        const response = await fetch(url, { 
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000) 
        });
        
        if (!response.ok) return [];
        const data = await response.json();

        return data.map(p => {
            const item = p.items?.[0];
            const seller = item?.sellers?.[0]?.commertialOffer;
            const preco = seller?.Price;
            if (!preco || preco <= 0) return null;
            
            // CORREÇÃO DE LINK: Verifica se o link já vem com "http"
            const linkOriginal = p.link || "";
            const linkFinal = linkOriginal.startsWith('http') 
                ? linkOriginal 
                : `https://${dominios[loja]}${linkOriginal}`;

            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: linkFinal,
                imagem: item?.images?.[0]?.imageUrl || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

// Placeholder para Drogasil (Fase de Testes)
async function buscarDrogasil(medicamento) {
    return []; 
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    let selecionadas = req.body?.lojas || ['Extrafarma', 'Pague Menos', 'Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    let resultados = [];
    if (remedio) {
        const buscas = [];
        if (selecionadas.includes('Extrafarma')) buscas.push(buscarVTEX(remedio, 'Extrafarma'));
        if (selecionadas.includes('Pague Menos')) buscas.push(buscarVTEX(remedio, 'Pague Menos'));
        if (selecionadas.includes('Globo')) buscas.push(buscarVTEX(remedio, 'Globo'));
        if (selecionadas.includes('Drogasil')) buscas.push(buscarDrogasil(remedio));

        const resTotal = await Promise.all(buscas);
        // ORDENAÇÃO GERAL: Menor Preço Primeiro
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    const listaHTML = resultados.map(r => `
        <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-blue-500/30 transition">
            <img src="${r.imagem}" class="w-14 h-14 rounded-lg bg-white object-contain p-1 shadow-inner" onerror="this.src='https://placehold.co/100x100?text=Remedio'">
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h3 class="text-[10px] font-bold text-slate-200 uppercase truncate">${r.nome}</h3>
                    ${r === resultados[0] ? '<span class="bg-green-500/20 text-green-400 text-[8px] px-2 py-0.5 rounded-full font-black ml-2 uppercase">Melhor Preço</span>' : ''}
                </div>
                <div class="flex justify-between items-end mt-1">
                    <div>
                        <p class="text-[8px] font-black ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Globo' ? 'text-orange-500' : 'text-red-400')} uppercase tracking-tighter">${r.loja}</p>
                        <p class="text-green-400 font-mono text-xl font-black leading-none">${r.preco}</p>
                    </div>
                    <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-2 rounded-xl text-[9px] font-bold text-blue-400 border border-slate-700 hover:bg-slate-700 transition">🛒 IR AO SITE</a>
                </div>
            </div>
        </div>
    `).join('');

    res.send(\`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu - Saúde e Economia</title>
        <script>
            function toggleAll(master) {
                const cbs = document.getElementsByName('lojas');
                cbs.forEach(cb => cb.checked = master.checked);
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1 font-bold italic">Sargento F Abreu | Economia UFMA</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="\${remedio}" placeholder="Nome do remédio (ex: Dorflex)..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Farmácias em São Luís</span>
                        <label class="flex items-center gap-2 text-[10px] font-bold text-blue-400 cursor-pointer uppercase">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0">
                            Selecionar Todas
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-3">
                        <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-blue-300">
                            <input type="checkbox" name="lojas" value="Extrafarma" \${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600"> Extrafarma
                        </label>
                        <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-red-300">
                            <input type="checkbox" name="lojas" value="Pague Menos" \${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-600"> Pague Menos
                        </label>
                        <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-orange-300">
                            <input type="checkbox" name="lojas" value="Globo" \${selecionadas.includes('Globo') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-orange-500"> Globo
                        </label>
                        <label class="flex items-center gap-2 text-xs cursor-pointer hover:text-green-300">
                            <input type="checkbox" name="lojas" value="Drogasil" \${selecionadas.includes('Drogasil') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-green-600"> 
                            Drogasil <span class="text-[8px] bg-slate-800 px-1 rounded text-slate-500 border border-slate-700 font-bold ml-1">TESTES</span>
                        </label>
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-900/40">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-4">
                \${listaHTML || (remedio ? '<p class="text-center text-slate-500 text-sm italic">Nenhum resultado encontrado.</p>' : '')}
            </div>
        </div>
    </body>
    </html>\`);
});

module.exports = app;
