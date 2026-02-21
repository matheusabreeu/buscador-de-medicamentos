const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

const meliuzSlugs = {
    'Extrafarma': 'extrafarma',
    'Pague Menos': 'pague-menos',
    'Drogasil': 'cupom-drogasil',
    'Ultrafarma': 'ultrafarma'
};

// Função para capturar cashback real do Méliuz
async function obterCashbackReal(loja) {
    const slug = meliuzSlugs[loja];
    if (!slug) return { pct: 0, label: '0%' };
    try {
        const url = 'https://www.meliuz.com.br/desconto/' + slug;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error();
        const html = await response.text();
        const regex = /Ativar até <span>(\d+,?\d?)%<\/span>/;
        const match = html.match(regex);
        if (match && match[1]) {
            const valor = match[1].replace(',', '.');
            return { pct: parseFloat(valor), label: match[1] + '%' };
        }
        return { pct: 0, label: 'Ver site' };
    } catch (e) {
        const fallbacks = { 'Extrafarma': '4%', 'Pague Menos': '8%', 'Drogasil': '3%', 'Ultrafarma': '3%' };
        return { pct: parseFloat(fallbacks[loja]) || 0, label: fallbacks[loja] || '0%' };
    }
}

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br',
            'Drogaria Globo': 'www.drogariaglobo.com.br',
            'Ultrafarma': 'www.ultrafarma.com.br'
        };
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(medicamento) + '&_from=0&_to=15';
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
                link: p.link.startsWith('http') ? p.link : 'https://' + dominios[loja] + p.link,
                imagem: item?.images?.[0]?.imageUrl || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo', 'Ultrafarma'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    const [cashEx, cashPa, cashDr, cashUl] = await Promise.all([
        obterCashbackReal('Extrafarma'), obterCashbackReal('Pague Menos'),
        obterCashbackReal('Drogasil'), obterCashbackReal('Ultrafarma')
    ]);
    const cashDict = { 'Extrafarma': cashEx, 'Pague Menos': cashPa, 'Drogasil': cashDr, 'Ultrafarma': cashUl, 'Drogaria Globo': { pct: 0, label: '0%' } };

    let resultados = [];
    if (remedio) {
        const buscas = selecionadas.map(l => buscarFarmacia(remedio, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    resultados.forEach((r, idx) => {
        const info = cashDict[r.loja];
        const valorC = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : (r.loja === 'Ultrafarma' ? 'text-emerald-400' : 'text-red-400'));
        
        listaHTML += '<div class="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4 mb-3 shadow-lg">' +
            '<img src="' + r.imagem + '" class="w-12 h-12 rounded-lg bg-white object-contain p-1">' +
            '<div class="flex-1 min-w-0">' +
                '<div class="flex justify-between items-start">' +
                    '<h3 class="text-[10px] font-bold text-slate-100 uppercase truncate">' + r.nome + '</h3>' +
                    (idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-[7px] px-2 py-0.5 rounded-full font-black uppercase">Melhor Preço</span>' : '') +
                '</div>' +
                '<div class="flex justify-between items-end mt-1">' +
                    '<div>' +
                        '<div class="flex items-center">' +
                            '<p class="text-[8px] font-black ' + cor + ' uppercase">' + r.loja + '</p>' +
                            (info.pct > 0 ? '<span class="text-[8px] text-emerald-400 font-bold ml-2">+' + valorC + ' (' + info.label + ') de volta</span>' : '') +
                        '</div>' +
                        '<p class="text-white font-mono text-xl font-black mt-1">' + r.preco + '</p>' +
                    '</div>' +
                    '<a href="' + r.link + '" target="_blank" class="bg-cyan-600 px-4 py-2 rounded-xl text-[9px] font-bold text-white uppercase shadow-lg shadow-cyan-900/40">Comprar</a>' +
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
        <script>function toggleAll(m){document.getElementsByName('lojas').forEach(c=>c.checked=m.checked);}</script>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-black text-cyan-500 italic uppercase tracking-tighter">Buscador de Medicamentos 💊</h1>
                <p class="text-emerald-500 text-[10px] uppercase tracking-widest mt-1 font-bold">Melhores descontos para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-white/10 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-white/5 focus:border-cyan-500 transition text-white placeholder-slate-500">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                    <div class="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase">Filtro de Redes</span>
                        <label class="flex items-center gap-1 text-[10px] font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="rounded bg-slate-800 border-white/10 text-cyan-500 focus:ring-0"> TODAS
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-4">
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Ultrafarma" ${selecionadas.includes('Ultrafarma') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-emerald-500"> Ultrafarma</label>
                        
                        <div class="flex flex-col opacity-40">
                           <label class="flex items-center gap-2 text-xs italic cursor-not-allowed">
                               <input type="checkbox" disabled class="rounded bg-slate-800 border-white/10"> Drogasil
                           </label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-[8px] text-cyan-500 font-bold mt-1 underline">Busca Manual →</a>
                        </div>
                    </div>
                </div>

                <button type="submit" class="w-full bg-cyan-600 p-4 rounded-2xl font-black uppercase text-xs hover:bg-cyan-500 transition active:scale-95 shadow-lg shadow-cyan-900/40">
                    🔍 Buscar Menor Preço
                </button>
            </form>

            <div class="space-y-2 mb-10">${listaHTML}</div>

            <div class="mt-12 pt-6 border-t border-white/10">
                <h4 class="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-4 text-center">Cashback Méliuz (Instruções)</h4>
                <div class="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20 mb-6 text-center">
                    <p class="text-emerald-400 text-[10px] font-black uppercase mb-2">⚠️ Como Ativar:</p>
                    <p class="text-slate-400 text-[9px] uppercase font-bold leading-tight">Clique na farmácia abaixo, ative o cashback e volte aqui para comprar.</p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <a href="${cashEx.link}" target="_blank" class="bg-slate-900 p-3 rounded-2xl border border-white/5 text-center hover:bg-slate-800">
                        <p class="text-[7px] text-slate-500 uppercase">Extrafarma</p>
                        <p class="text-xs font-black text-white">${cashEx.label}</p>
                    </a>
                    <a href="${cashPa.link}" target="_blank" class="bg-slate-900 p-3 rounded-2xl border border-white/5 text-center hover:bg-slate-800">
                        <p class="text-[7px] text-slate-500 uppercase">Pague Menos</p>
                        <p class="text-xs font-black text-white">${cashPa.label}</p>
                    </a>
                    <a href="${cashDr.link}" target="_blank" class="bg-slate-900 p-3 rounded-2xl border border-white/5 text-center hover:bg-slate-800">
                        <p class="text-[7px] text-slate-500 uppercase">Drogasil</p>
                        <p class="text-xs font-black text-white">${cashDr.label}</p>
                    </a>
                    <a href="${cashUl.link}" target="_blank" class="bg-slate-900 p-3 rounded-2xl border border-white/5 text-center hover:bg-slate-800">
                        <p class="text-[7px] text-slate-500 uppercase">Ultrafarma</p>
                        <p class="text-xs font-black text-white">${cashUl.label}</p>
                    </a>
                </div>
                <p class="text-center text-[7px] text-slate-500 mt-6 italic uppercase tracking-widest">* Drogaria Globo sem cashback. Valores dinâmicos do Méliuz.</p>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
