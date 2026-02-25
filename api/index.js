const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

const meliuzSlugs = {
    'Extrafarma': 'extrafarma',
    'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil',
    'Ultrafarma': 'ultrafarma'
};

// Tenta capturar a porcentagem viva do site a cada requisição
async function obterCashbackReal(loja) {
    const slug = meliuzSlugs[loja];
    if (!slug) return { pct: 0, label: '0%', link: '#' };
    const linkMeliuz = 'https://www.meliuz.com.br/desconto/' + slug;
    
    try {
        const response = await fetch(linkMeliuz, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            signal: AbortSignal.timeout(5000)
        });
        const html = await response.text();
        
        // Busca o padrão exato que você viu na inspeção do site
        const regex = /Ativar\s*(?:até\s*)?<span>([\d,]+)%<\/span>/i;
        const match = html.match(regex);
        
        if (match && match[1]) {
            const pctValor = parseFloat(match[1].replace(',', '.'));
            const prefixo = html.toLowerCase().includes('até') ? 'Até ' : '';
            return { pct: pctValor, label: prefixo + match[1] + '%', link: linkMeliuz };
        }
        
        // Se não encontrar o span, tenta um fallback genérico de busca
        return { pct: 0, label: 'Ver no Site', link: linkMeliuz };
    } catch (e) {
        // Se houver bloqueio total, informa que precisa verificar manualmente
        return { pct: 0, label: 'Consultar Méliuz', link: linkMeliuz };
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
                loja: loja, nome: p.productName,
                preco: price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: price, link: p.link.startsWith('http') ? p.link : 'https://' + dominios[loja] + p.link,
                imagem: (item.images && item.images[0] && item.images[0].imageUrl) || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const q = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    // Busca Cashback REAL em tempo real a cada carregamento
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
        listaHTML = '<div class="text-center p-12 bg-slate-900 rounded-3xl border border-white/5 shadow-2xl"><p class="text-slate-400 font-bold uppercase text-xl">⚠️ Nada encontrado.</p></div>';
    } else {
        resultados.forEach((r, idx) => {
            const info = cashDict[r.loja] || { pct: 0, label: '0%' };
            const vCash = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const corLoja = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
            
            listaHTML += '<div class="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col gap-6 mb-8 hover:border-cyan-500/30 transition shadow-2xl">' +
                '<div class="flex items-center gap-6">' +
                    '<img src="' + r.imagem + '" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">' +
                    '<div class="flex-1">' +
                        (idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full font-black uppercase mb-3 inline-block">Melhor Preço</span>' : '') +
                        '<h3 class="text-lg font-black text-slate-100 uppercase leading-tight">' + r.nome + '</h3>' +
                    '</div>' +
                '</div>' +
                '<div class="flex justify-between items-center bg-black/30 p-5 rounded-2xl border border-white/5">' +
                    '<div>' +
                        '<div class="flex flex-wrap items-center gap-3 mb-2">' +
                            '<p class="text-sm font-black ' + corLoja + ' uppercase tracking-widest">' + r.loja + '</p>' +
                            (info.pct > 0 ? '<span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-lg">+ ' + vCash + ' de volta</span>' : '') + 
                        '</div>' +
                        '<p class="text-white font-mono text-4xl font-black leading-none">' + r.preco + '</p>' +
                    '</div>' +
                    '<a href="' + r.link + '" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white uppercase shadow-lg shadow-cyan-900/40 hover:bg-cyan-500 transition active:scale-95">COMPRAR</a>' +
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
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans selection:bg-cyan-500/30">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12">
                <a href="/" class="inline-block hover:scale-105 transition-transform duration-200">
                    <h1 class="text-5xl font-black text-cyan-500 italic uppercase tracking-tighter leading-none mb-4">Buscador de<br>Remédios 💊</h1>
                </a>
                <p class="text-emerald-500 text-base uppercase tracking-widest font-bold">Monitorando o Mercado para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-10 rounded-[40px] border border-white/10 shadow-2xl mb-16">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-8 rounded-3xl mb-10 outline-none border-2 border-white/5 focus:border-cyan-500 transition text-white text-2xl placeholder-slate-500 shadow-inner">
                
                <div class="mb-12 bg-slate-950/50 p-8 rounded-3xl border border-white/5">
                    <div class="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                        <span class="text-base font-black text-slate-500 uppercase">Farmácias Ativas</span>
                        <label class="flex items-center gap-3 text-base font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="w-6 h-6 rounded bg-slate-800 border-white/10 text-cyan-500"> TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-1 gap-y-10">
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-5 text-lg cursor-pointer"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        
                        <div class="flex flex-col gap-3 pt-6 border-t border-white/5">
                           <label class="flex items-center gap-5 text-lg italic opacity-40"><input type="checkbox" disabled class="w-8 h-8 rounded bg-slate-800 border-white/10"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-base text-cyan-500 font-black underline uppercase tracking-tighter ml-12">Acessar site Drogasil →</a>
                        </div>

                        <div class="flex flex-col gap-3">
                           <label class="flex items-center gap-5 text-lg italic opacity-40"><input type="checkbox" disabled class="w-8 h-8 rounded bg-slate-800 border-white/10"> Ultrafarma</label>
                           <a href="https://www.ultrafarma.com.br" target="_blank" class="text-base text-cyan-500 font-black underline uppercase tracking-tighter ml-12">Acessar site Ultrafarma →</a>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-lg shadow-lg shadow-cyan-900/40 hover:bg-cyan-500 transition active:scale-95">🔍 BUSCAR MENOR PREÇO</button>
            </form>

            <div class="space-y-8 mb-20">${listaHTML}</div>

            <div class="mt-24 pt-12 border-t border-white/10">
                <h4 class="text-base text-slate-500 font-black uppercase tracking-widest mb-10 text-center">Dinheiro de Volta (Méliuz)</h4>
                <div class="grid grid-cols-2 gap-5 mb-12 text-center">
                    ${['Extrafarma', 'Pague Menos', 'Drogasil', 'Ultrafarma'].map(l => `
                        <a href="${cashDict[l].link}" target="_blank" class="bg-slate-900 p-6 rounded-[30px] border border-white/5">
                            <p class="text-xs text-slate-400 uppercase mb-2 font-black">${l}</p>
                            <p class="text-xl font-black text-cyan-400">${cashDict[l].label}</p>
                        </a>
                    `).join('')}
                </div>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
