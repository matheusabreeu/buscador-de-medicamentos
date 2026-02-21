const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Slugs do Méliuz para cada farmácia
const meliuzSlugs = {
    'Extrafarma': 'extrafarma',
    'Pague Menos': 'pague-menos',
    'Drogasil': 'cupom-drogasil',
    'Ultrafarma': 'ultrafarma'
};

// FUNÇÃO PARA BUSCAR CASHBACK REAL NO MÉLIUZ
async function obterCashbackReal(loja) {
    const slug = meliuzSlugs[loja];
    if (!slug || slug === '#') return { pct: 0, label: '0%' };
    
    try {
        const url = `https://www.meliuz.com.br/desconto/${slug}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) throw new Error('Bloqueio Méliuz');
        const html = await response.text();
        
        // Procura o padrão: "Ativar até <span>X%</span>" que você encontrou
        const regex = /Ativar até <span>(\d+,?\d?)%<\/span>/;
        const match = html.match(regex);
        
        if (match && match[1]) {
            const valor = match[1].replace(',', '.');
            return { pct: parseFloat(valor), label: match[1] + '%' };
        }
        return { pct: 0, label: 'Ver site' };
    } catch (e) {
        // Se falhar, retorna valores base para não quebrar o site
        const fallback = { 'Extrafarma': '4%', 'Pague Menos': '8%', 'Drogasil': '3%', 'Ultrafarma': '3%' };
        return { pct: parseFloat(fallback[loja]) || 0, label: fallback[loja] || '0%' };
    }
}

async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = { 'Extrafarma': 'www.extrafarma.com.br', 'Pague Menos': 'www.paguemenos.com.br', 'Globo': 'www.drogariaglobo.com.br' };
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(medicamento)}&_from=0&_to=15`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
                link: p.link.startsWith('http') ? p.link : `https://${dominios[loja]}${p.link}`,
                imagem: item?.images?.[0]?.imageUrl || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    // Carrega os Cashbacks dinamicamente no acesso
    const [cashExtra, cashPague, cashDrog, cashUltra] = await Promise.all([
        obterCashbackReal('Extrafarma'),
        obterCashbackReal('Pague Menos'),
        obterCashbackReal('Drogasil'),
        obterCashbackReal('Ultrafarma')
    ]);

    const cashDict = { 'Extrafarma': cashExtra, 'Pague Menos': cashPague, 'Drogasil': cashDrog, 'Ultrafarma': cashUltra, 'Globo': { pct: 0, label: '0%' } };

    let resultados = [];
    if (remedio) {
        const buscas = selecionadas.map(l => buscarVTEX(remedio, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    resultados.forEach((r, index) => {
        const info = cashDict[r.loja];
        const valorCash = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const badge = info.pct > 0 ? `<span class="text-[8px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-bold ml-2">+ \${valorCash} (\${info.label}) de volta</span>` : '';
        
        listaHTML += `<div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 mb-3">
            <img src="\${r.imagem}" class="w-12 h-12 rounded-lg bg-white object-contain p-1">
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h3 class="text-[10px] font-bold text-slate-200 uppercase truncate">\${r.nome}</h3>
                    \${index === 0 ? '<span class="bg-green-500/20 text-green-400 text-[7px] px-2 py-0.5 rounded-full font-black uppercase">Melhor Preço</span>' : ''}
                </div>
                <div class="flex justify-between items-end mt-1">
                    <div>
                        <div class="flex items-center">
                            <p class="text-[8px] font-black uppercase tracking-tighter">\${r.loja}</p>\${badge}
                        </div>
                        <p class="text-green-400 font-mono text-xl font-black mt-1">\${r.preco}</p>
                    </div>
                    <a href="\${r.link}" target="_blank" class="bg-blue-600 px-4 py-2 rounded-xl text-[9px] font-bold text-white uppercase">Comprar</a>
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
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💊</text></svg>">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador de Medicamentos</title>
        <script>function toggleAll(m){document.getElementsByName('lojas').forEach(c=>c.checked=m.checked);}</script>
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-6">
                <h1 class="text-3xl font-bold text-blue-500 italic">Buscador de Medicamentos 💊</h1>
                <p class="text-slate-500 text-[10px] uppercase tracking-widest mt-1 font-bold italic">Melhores descontos para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="\${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                
                <div class="mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div class="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest text-xs">Filtro</span>
                        <label class="flex items-center gap-1 text-[10px] font-bold text-blue-400 cursor-pointer uppercase">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"> Todas
                        </label>
                    </div>
                    <div class="grid grid-cols-2 gap-y-4">
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Extrafarma" \${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-blue-600"> Extrafarma</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Pague Menos" \${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-red-600"> Pague Menos</label>
                        <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="lojas" value="Globo" \${selecionadas.includes('Globo') ? 'checked' : ''} class="rounded border-slate-700 bg-slate-800 text-orange-500"> Globo</label>
                        
                        <div class="flex flex-col opacity-40">
                           <label class="flex items-center gap-2 text-xs italic cursor-not-allowed">
                               <input type="checkbox" disabled class="rounded border-slate-700 bg-slate-800"> Drogasil / Ultra
                           </label>
                           <div class="flex gap-2 mt-1">
                               <a href="https://www.drogasil.com.br" target="_blank" class="text-[7px] text-green-500 font-bold underline">Drogasil →</a>
                               <a href="https://www.ultrafarma.com.br" target="_blank" class="text-[7px] text-green-500 font-bold underline">Ultrafarma →</a>
                           </div>
                        </div>
                    </div>
                </div>

                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-900/40 uppercase">🔍 Buscar Menor Preço</button>
            </form>

            <div class="space-y-4 mb-10">\${listaHTML}</div>

            <div class="mt-12 pt-6 border-t border-slate-800">
                <h4 class="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-3 text-center">Cashback Méliuz (Instruções)</h4>
                <div class="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 mb-6 text-center">
                    <p class="text-yellow-500 text-[10px] font-black uppercase mb-2">⚠️ Como Ativar:</p>
                    <p class="text-slate-400 text-[9px] uppercase font-bold leading-tight">Clique em uma farmácia abaixo, ative o cashback no Méliuz e volte aqui para finalizar a compra.</p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <a href="\${cashExtra.link}" class="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                        <p class="text-[7px] text-slate-500 uppercase">Extrafarma</p>
                        <p class="text-xs font-black">\${cashExtra.label}</p>
                    </a>
                    <a href="\${cashPague.link}" class="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                        <p class="text-[7px] text-slate-500 uppercase">Pague Menos</p>
                        <p class="text-xs font-black">\${cashPague.label}</p>
                    </a>
                    <a href="\${cashDrog.link}" class="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                        <p class="text-[7px] text-slate-500 uppercase">Drogasil</p>
                        <p class="text-xs font-black">\${cashDrog.label}</p>
                    </a>
                    <a href="\${cashUltra.link}" class="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                        <p class="text-[7px] text-slate-500 uppercase">Ultrafarma</p>
                        <p class="text-xs font-black">\${cashUltra.label}</p>
                    </a>
                </div>
                <p class="text-center text-[7px] text-slate-600 mt-4 italic uppercase">* Globo sem cashback. Valores atualizados automaticamente do Méliuz.</p>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
