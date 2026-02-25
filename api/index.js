const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

const meliuzSlugs = {
    'Extrafarma': 'extrafarma',
    'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil',
    'Ultrafarma': 'ultrafarma'
};

async function obterCashbackReal(loja) {
    const slug = meliuzSlugs[loja];
    if (!slug) return { pct: 0, label: '0%', link: '#' };
    const linkMeliuz = 'https://www.meliuz.com.br/desconto/' + slug;
    
    try {
        const response = await fetch(linkMeliuz, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9'
            },
            signal: AbortSignal.timeout(5000)
        });
        const html = await response.text();
        
        // Regex aprimorada para capturar variações de "Ativar" e "Até"
        const regex = /Ativar\s*(?:até\s*)?<span>([\d,]+)%<\/span>/i;
        const match = html.match(regex);
        
        if (match && match[1]) {
            const prefixo = html.toLowerCase().includes('até') ? 'Até ' : '';
            return { pct: parseFloat(match[1].replace(',', '.')), label: prefixo + match[1] + '%', link: linkMeliuz };
        }
        return { pct: 0, label: 'Ver site', link: linkMeliuz };
    } catch (e) {
        // Fallbacks baseados nas suas últimas pesquisas manuais
        const falls = { 'Extrafarma': '2,5%', 'Pague Menos': '8%', 'Drogasil': 'Até 3%', 'Ultrafarma': 'Até 3%' };
        return { pct: parseFloat(falls[loja]) || 0, label: falls[loja] || '0%', link: linkMeliuz };
    }
}

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Drogaria Globo': 'www.drogariaglobo.com.br'
        };
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(medicamento) + '&_from=0&_to=15';
        const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
        const data = await response.json();
        return data.map(p => {
            const item = p.items && p.items[0];
            const price = item?.sellers?.[0]?.commertialOffer?.Price;
            if (!price || price <= 0) return null;
            return {
                loja: loja,
                nome: p.productName,
                preco: price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: price,
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

    const [cEx, cPa, cDr, cUl] = await Promise.all([
        obterCashbackReal('Extrafarma'), obterCashbackReal('Pague Menos'),
        obterCashbackReal('Drogasil'), obterCashbackReal('Ultrafarma')
    ]);
    const cashDict = { 'Extrafarma': cEx, 'Pague Menos': cPa, 'Drogasil': cDr, 'Ultrafarma': cUl, 'Drogaria Globo': { pct: 0, label: '0%' } };

    let resultados = [];
    if (q) {
        const buscas = selecionadas.map(l => buscarFarmacia(q, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    if (q && resultados.length === 0) {
        listaHTML = '<div class="text-center p-12 bg-slate-900 rounded-3xl border border-white/5 shadow-2xl">' +
                    '<p class="text-slate-400 font-bold uppercase text-lg tracking-widest">⚠️ Nenhum resultado encontrado.</p></div>';
    } else {
        resultados.forEach((r, idx) => {
            const info = cashDict[r.loja] || { pct: 0, label: '0%' };
            const vCash = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
            
            listaHTML += '<div class="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col gap-4 mb-5 hover:border-cyan-500/30 transition shadow-xl">' +
                '<div class="flex items-center gap-4">' +
                    '<img src="' + r.imagem + '" class="w-20 h-20 rounded-lg bg-white object-contain p-1 flex-shrink-0">' +
                    '<div class="flex-1">' +
                        (idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full font-black uppercase mb-2 inline-block">Melhor Preço</span>' : '') +
                        '<h3 class="text-base font-bold text-slate-100 uppercase leading-tight">' + r.nome + '</h3>' +
                    '</div>' +
                '</div>' +
                '<div class="flex justify-between items-end bg-black/20 p-4 rounded-xl">' +
                    '<div>' +
                        '<div class="flex flex-wrap items-center gap-2 mb-1">' +
                            '<p class="text-xs font-black ' + cor + ' uppercase tracking-wider">' + r.loja + '</p>' +
                            (info.pct > 0 ? '<span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">+ ' + vCash + ' de volta (' + info.label + ')</span>' : '') + 
                        '</div>' +
                        '<p class="text-white font-mono text-3xl font-black leading-none">' + r.preco + '</p>' +
                    '</div>' +
                    '<a href="' + r.link + '" target="_blank" class="bg-cyan-600 px-6 py-4 rounded-2xl text-sm font-black text-white uppercase shadow-lg shadow-cyan-900/40 hover:bg-cyan-500 transition active:scale-95">COMPRAR</a>' +
                '</div>' +
            '</div>';
        });
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💊</text></svg>">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador de Medicamentos</title>
        <script>function toggleAll(m){document.getElementsByName('lojas').forEach(c=>c.checked=m.checked);}</script>
        <style>
            body { font-size: 18px; }
            input::placeholder { font-size: 1.1rem; }
        </style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans selection:bg-cyan-500/30">
        <div class="max-w-md mx-auto">
            <header class="text-center py-10">
                <a href="/" class="inline-block hover:scale-105 transition-transform duration-200">
                    <h1 class="text-4xl font-black text-cyan-500 italic uppercase tracking-tighter leading-none">Buscador de<br>Medicamentos 💊</h1>
                </a>
                <p class="text-emerald-500 text-sm uppercase tracking-widest mt-3 font-bold">Economia para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-8 rounded-3xl border border-white/10 shadow-2xl mb-12">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-6 rounded-2xl mb-8 outline-none border border-white/5 focus:border-cyan-500 transition text-white text-xl placeholder-slate-500 shadow-inner">
                
                <div class="mb-10 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
                    <div class="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                        <span class="text-sm font-black text-slate-500 uppercase">Farmácias Ativas</span>
                        <label class="flex items-center gap-2 text-sm font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="w-5 h-5 rounded bg-slate-800 border-white/10 text-cyan-500"> TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-1 gap-y-8">
                        <label class="flex items-center gap-4 text-base cursor-pointer"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-4 text-base cursor-pointer"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-4 text-base cursor-pointer"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        
                        <div class="flex flex-col gap-2 pt-4 border-t border-white/5">
                           <label class="flex items-center gap-4 text-base italic opacity-40"><input type="checkbox" disabled class="w-6 h-6 rounded bg-slate-800 border-white/10"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-sm text-cyan-500 font-black underline uppercase tracking-tighter ml-10">Acessar site Drogasil →</a>
                        </div>

                        <div class="flex flex-col gap-2">
                           <label class="flex items-center gap-4 text-base italic opacity-40"><input type="checkbox" disabled class="w-6 h-6 rounded bg-slate-800 border-white/10"> Ultrafarma</label>
                           <a href="https://www.ultrafarma.com.br" target="_blank" class="text-sm text-cyan-500 font-black underline uppercase tracking-tighter ml-10">Acessar site Ultrafarma →</a>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-6 rounded-2xl font-black uppercase text-base shadow-lg shadow-cyan-900/40 hover:bg-cyan-500 transition active:scale-95">🔍 BUSCAR MENOR PREÇO</button>
            </form>

            <div class="space-y-6 mb-16">${listaHTML}</div>

            <div class="mt-20 pt-10 border-t border-white/10">
                <h4 class="text-sm text-slate-500 font-black uppercase tracking-widest mb-8 text-center">Ativar Dinheiro de Volta</h4>
                <div class="grid grid-cols-2 gap-4 mb-10 text-center">
                    <a href="${cEx.link}" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/5">
                        <p class="text-xs text-slate-400 uppercase mb-1">Extrafarma</p><p class="text-lg font-black text-cyan-400">${cEx.label}</p></a>
                    <a href="${cPa.link}" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/5">
                        <p class="text-xs text-slate-400 uppercase mb-1">Pague Menos</p><p class="text-lg font-black text-red-400">${cPa.label}</p></a>
                    <a href="${cDr.link}" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/5">
                        <p class="text-xs text-slate-400 uppercase mb-1">Drogasil</p><p class="text-lg font-black text-emerald-400">${cDr.label}</p></a>
                    <a href="${cUl.link}" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/5">
                        <p class="text-xs text-slate-400 uppercase mb-1">Ultrafarma</p><p class="text-lg font-black text-emerald-400">${cUl.label}</p></a>
                </div>
                <div class="bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/20 text-center shadow-inner">
                    <p class="text-emerald-400 text-sm font-black uppercase mb-3">Guia Rápido:</p>
                    <p class="text-slate-400 text-base uppercase font-bold leading-tight">1. Toque no botão da farmácia acima. <br>2. Ative o cashback. <br>3. Volte aqui e busque seu remédio.</p>
                </div>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
