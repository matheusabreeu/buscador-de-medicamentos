const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));

// Valores de cashback fixos e seguros
const cashDict = {
    'Extrafarma': { pct: 2.5, label: '2,5%' },
    'Pague Menos': { pct: 8, label: '8%' },
    'Drogasil': { pct: 3, label: 'Até 3%' },
    'Ultrafarma': { pct: 3, label: 'Até 3%' },
    'Drogaria Globo': { pct: 0, label: '0%' }
};

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = { 
            'Extrafarma': 'www.extrafarma.com.br', 
            'Pague Menos': 'www.paguemenos.com.br', 
            'Drogaria Globo': 'www.drogariaglobo.com.br' 
        };
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(medicamento) + '&_from=0&_to=10';
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        return data.map(p => {
            const item = p.items && p.items[0];
            const price = item?.sellers?.[0]?.commertialOffer?.Price;
            if (!price || price <= 0) return null;
            return {
                loja: loja, nome: p.productName, valor: price,
                preco: price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                link: p.link.startsWith('http') ? p.link : 'https://' + dominios[loja] + p.link,
                imagem: (item.images && item.images[0] && item.images[0].imageUrl) || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const q = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    let resultados = [];
    if (q) {
        const buscas = selecionadas.map(l => buscarFarmacia(q, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    if (q && resultados.length === 0) {
        listaHTML = '<div class="text-center p-10 bg-slate-900 rounded-3xl border border-white/5"><p class="text-slate-400 font-bold uppercase text-lg">⚠️ Nada encontrado nas redes automáticas.</p></div>';
    } else {
        resultados.forEach((r, idx) => {
            const info = cashDict[r.loja] || { pct: 0, label: '0%' };
            const vC = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
            
            listaHTML += '<div class="bg-white/5 p-6 rounded-[35px] border border-white/10 mb-8 shadow-2xl">' +
                '<div class="flex items-center gap-6 mb-4">' +
                    '<img src="' + r.imagem + '" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">' +
                    '<div class="flex-1">' +
                        (idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full font-black uppercase mb-3 inline-block">Melhor Preço</span>' : '') +
                        '<h3 class="text-lg font-black text-slate-100 uppercase leading-tight">' + r.nome + '</h3>' +
                    '</div>' +
                '</div>' +
                '<div class="flex justify-between items-center bg-black/30 p-5 rounded-2xl border border-white/5">' +
                    '<div><p class="text-sm font-black ' + cor + ' uppercase">' + r.loja + '</p>' +
                    (info.pct > 0 ? '<p class="text-xs text-emerald-400 font-bold">+ ' + vC + ' de volta</p>' : '') + 
                    '<p class="text-white font-mono text-4xl font-black mt-1">' + r.preco + '</p></div>' +
                    '<a href="' + r.link + '" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white uppercase">COMPRAR</a>' +
                '</div></div>';
        });
    }

    res.send(`<!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu</title>
        <script>function toggleAll(m){document.getElementsByName('lojas').forEach(c=>c.checked=m.checked);}</script>
        <style>body { font-size: 20px; }</style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12">
                <a href="/"><h1 class="text-4xl font-black text-cyan-500 italic uppercase leading-none">Buscador<br>Abreu 💊</h1></a>
                <p class="text-emerald-500 text-sm font-bold uppercase mt-4">Economia para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-10 rounded-[40px] border border-white/10 shadow-2xl mb-16">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-8 rounded-3xl mb-10 border-2 border-white/5 focus:border-cyan-500 transition text-white text-2xl">
                
                <div class="mb-10 bg-slate-950/50 p-8 rounded-3xl border border-white/5">
                    <div class="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                        <span class="text-base font-black text-slate-500 uppercase">Redes Ativas</span>
                        <label class="flex items-center gap-3 text-base font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="w-6 h-6 rounded bg-slate-800 border-white/10 text-cyan-500"> TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-1 gap-y-10">
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        
                        <div class="flex flex-col gap-2 pt-6 border-t border-white/5">
                           <label class="flex items-center gap-5 text-lg italic opacity-40"><input type="checkbox" disabled class="w-8 h-8 rounded bg-slate-800 border-white/10"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-base text-cyan-500 font-black underline uppercase ml-12">Acessar site Drogasil →</a>
                        </div>
                        <div class="flex flex-col gap-2">
                           <label class="flex items-center gap-5 text-lg italic opacity-40"><input type="checkbox" disabled class="w-8 h-8 rounded bg-slate-800 border-white/10"> Ultrafarma</label>
                           <a href="https://www.ultrafarma.com.br" target="_blank" class="text-base text-cyan-500 font-black underline uppercase ml-12">Acessar site Ultrafarma →</a>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-lg shadow-lg">🔍 BUSCAR AGORA</button>
            </form>

            <div class="space-y-8 mb-20">${listaHTML}</div>

            <div class="mt-24 pt-12 border-t border-white/10 text-center">
                <h4 class="text-base text-slate-500 font-black uppercase mb-10">Ativar Cashback (Méliuz)</h4>
                <div class="grid grid-cols-2 gap-5 mb-12">
                    <a href="https://www.meliuz.com.br/desconto/extrafarma" target="_blank" class="bg-slate-900 p-6 rounded-3xl border border-white/5"><p class="text-xs text-slate-400 mb-2">Extrafarma</p><p class="text-xl font-black text-cyan-400">2,5%</p></a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-pague-menos" target="_blank" class="bg-slate-900 p-6 rounded-3xl border border-white/5"><p class="text-xs text-slate-400 mb-2">Pague Menos</p><p class="text-xl font-black text-red-400">8%</p></a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-drogasil" target="_blank" class="bg-slate-900 p-6 rounded-3xl border border-white/5"><p class="text-xs text-slate-400 mb-2">Drogasil</p><p class="text-xl font-black text-emerald-400">Até 3%</p></a>
                    <a href="https://www.meliuz.com.br/desconto/ultrafarma" target="_blank" class="bg-slate-900 p-6 rounded-3xl border border-white/5"><p class="text-xs text-slate-400 mb-2">Ultrafarma</p><p class="text-xl font-black text-emerald-400">Até 3%</p></a>
                </div>
            </div>
        </div>
    </body>
    </html>`);
});
module.exports = app;
